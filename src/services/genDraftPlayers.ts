import { randomNormal } from 'd3-random';
import { generate as generateFaceRaw } from 'facesjs';
// Basketball-only face generation — matches ZenGM's reject-loop pattern:
// (1) don't pass a made-up `jersey: { id: 'basketball' }` override (not a real feature id),
// (2) reject any generated face that rolled a baseball hat or football eye-black.
const generateFace = (opts?: { race?: string; gender?: 'male' | 'female' }): any => {
  let face = generateFaceRaw(undefined, opts as any);
  let attempts = 0;
  while (
    attempts < 10 &&
    face?.accessories?.id &&
    (String(face.accessories.id).startsWith('hat') || face.accessories.id === 'eye-black')
  ) {
    face = generateFaceRaw(undefined, opts as any);
    attempts++;
  }
  return face;
};

import { Player, Position, Ratings, NameData, MoodTrait } from '../genplayersconstants';
import { COLLEGE_FREQUENCIES, COUNTRY_FREQUENCIES, EUROLEAGUE_TEAMS, ENDESA_TEAMS, NBL_TEAMS, BLEAGUE_TEAMS, getRaceFrequencies } from '../genplayersconstants';

const TRAIT_EXCLUSIONS: [MoodTrait, MoodTrait][] = [
  ['LOYAL', 'MERCENARY'],
  ['AMBASSADOR', 'DRAMA_MAGNET'],
  ['DIVA', 'AMBASSADOR'],
];

const ARCHETYPE_PROFILES: Record<string, Record<string, number>> = {
  // PG
  'Primary Creator':       { hgt:30, stre:35, spd:72, jmp:55, endu:60, ins:40, dnk:45, ft:65, fg:60, tp:55, oiq:75, diq:50, drb:80, pss:75, reb:30, drivingDunk: 58, standingDunk: 15 },
  'Scoring Guard':         { hgt:25, stre:35, spd:65, jmp:55, endu:55, ins:35, dnk:50, ft:68, fg:65, tp:65, oiq:60, diq:45, drb:65, pss:50, reb:25, drivingDunk: 62, standingDunk: 18 },
  'Defensive Pest':        { hgt:28, stre:50, spd:70, jmp:60, endu:65, ins:30, dnk:40, ft:50, fg:45, tp:40, oiq:55, diq:75, drb:60, pss:55, reb:40, drivingDunk: 55, standingDunk: 14 },
  'Pass-First Floor Gen':  { hgt:28, stre:35, spd:65, jmp:45, endu:60, ins:30, dnk:35, ft:60, fg:50, tp:45, oiq:80, diq:50, drb:75, pss:85, reb:30, drivingDunk: 45, standingDunk: 10 },
  'Two-Way PG':            { hgt:32, stre:50, spd:68, jmp:58, endu:62, ins:35, dnk:48, ft:58, fg:55, tp:52, oiq:68, diq:68, drb:70, pss:65, reb:38, drivingDunk: 60, standingDunk: 16 },
  'Jumbo Playmaker':       { hgt:48, stre:58, spd:62, jmp:55, endu:65, ins:45, dnk:55, ft:68, fg:60, tp:62, oiq:82, diq:55, drb:82, pss:85, reb:55, drivingDunk: 55, standingDunk: 25 },
  'Explosive Slasher':     { hgt:28, stre:45, spd:85, jmp:90, endu:65, ins:50, dnk:70, ft:65, fg:55, tp:35, oiq:65, diq:45, drb:80, pss:60, reb:35, drivingDunk: 88, standingDunk: 20 },
  'Limitless Sniper':      { hgt:25, stre:30, spd:70, jmp:45, endu:75, ins:35, dnk:25, ft:90, fg:65, tp:92, oiq:85, diq:45, drb:85, pss:70, reb:25, drivingDunk: 35, standingDunk: 5 },
  // SG
  'Shooting Specialist':   { hgt:35, stre:35, spd:60, jmp:50, endu:55, ins:35, dnk:45, ft:80, fg:72, tp:80, oiq:60, diq:45, drb:50, pss:40, reb:30, drivingDunk: 42, standingDunk: 12 },
  'Slasher':               { hgt:38, stre:55, spd:75, jmp:72, endu:60, ins:50, dnk:78, ft:65, fg:60, tp:35, oiq:58, diq:50, drb:68, pss:45, reb:38, drivingDunk: 85, standingDunk: 30 },
  '3&D Wing':              { hgt:42, stre:50, spd:62, jmp:55, endu:60, ins:38, dnk:50, ft:70, fg:60, tp:72, oiq:58, diq:70, drb:48, pss:42, reb:40, drivingDunk: 52, standingDunk: 18 },
  'Combo Scorer':          { hgt:45, stre:42, spd:65, jmp:58, endu:58, ins:42, dnk:58, ft:68, fg:65, tp:62, oiq:62, diq:48, drb:60, pss:48, reb:35, drivingDunk: 62, standingDunk: 22 },
  'Defensive Stopper':     { hgt:40, stre:58, spd:68, jmp:62, endu:65, ins:35, dnk:48, ft:52, fg:50, tp:40, oiq:52, diq:80, drb:55, pss:42, reb:45, drivingDunk: 55, standingDunk: 20 },
  'Non-Scoring Lockdown':  { hgt:45, stre:68, spd:72, jmp:65, endu:75, ins:35, dnk:45, ft:40, fg:35, tp:20, oiq:35, diq:88, drb:40, pss:35, reb:50, drivingDunk: 50, standingDunk: 25 },
  'Movement Shooter':      { hgt:45, stre:35, spd:55, jmp:45, endu:65, ins:30, dnk:35, ft:85, fg:60, tp:85, oiq:65, diq:38, drb:40, pss:35, reb:30, drivingDunk: 35, standingDunk: 10 },
  // SF
  'All-Around Wing':       { hgt:47, stre:52, spd:60, jmp:60, endu:60, ins:48, dnk:60, ft:62, fg:60, tp:58, oiq:65, diq:62, drb:55, pss:50, reb:48, drivingDunk: 65, standingDunk: 30 },
  '3&D Forward':           { hgt:47, stre:52, spd:58, jmp:55, endu:58, ins:42, dnk:52, ft:68, fg:60, tp:74, oiq:58, diq:70, drb:42, pss:40, reb:45, drivingDunk: 55, standingDunk: 28 },
  'Athletic Finisher':     { hgt:48, stre:58, spd:68, jmp:75, endu:62, ins:52, dnk:80, ft:58, fg:58, tp:30, oiq:55, diq:55, drb:58, pss:42, reb:50, drivingDunk: 88, standingDunk: 45 },
  'Point Forward':         { hgt:48, stre:50, spd:60, jmp:55, endu:60, ins:50, dnk:55, ft:60, fg:60, tp:50, oiq:72, diq:55, drb:65, pss:70, reb:48, drivingDunk: 60, standingDunk: 32 },
  'Defensive Wing':        { hgt:52, stre:62, spd:62, jmp:60, endu:65, ins:45, dnk:52, ft:52, fg:50, tp:40, oiq:52, diq:78, drb:48, pss:42, reb:52, drivingDunk: 58, standingDunk: 28 },
  'Swiss Army Knife':      { hgt:42, stre:60, spd:65, jmp:60, endu:85, ins:50, dnk:50, ft:65, fg:55, tp:50, oiq:65, diq:70, drb:55, pss:50, reb:72, drivingDunk: 55, standingDunk: 15 },
  // PF
  'Stretch Four':          { hgt:62, stre:60, spd:48, jmp:50, endu:55, ins:50, dnk:55, ft:65, fg:60, tp:72, oiq:60, diq:55, drb:42, pss:40, reb:58, drivingDunk: 48, standingDunk: 52 },
  'Power Forward':         { hgt:64, stre:75, spd:42, jmp:55, endu:58, ins:68, dnk:65, ft:52, fg:52, tp:30, oiq:55, diq:65, drb:38, pss:35, reb:72, drivingDunk: 52, standingDunk: 78 },
  'Two-Way Forward':       { hgt:62, stre:65, spd:48, jmp:55, endu:60, ins:58, dnk:60, ft:55, fg:55, tp:48, oiq:60, diq:68, drb:42, pss:40, reb:62, drivingDunk: 55, standingDunk: 65 },
  'Athletic Four':         { hgt:62, stre:62, spd:55, jmp:72, endu:60, ins:55, dnk:72, ft:55, fg:52, tp:38, oiq:55, diq:60, drb:48, pss:38, reb:62, drivingDunk: 75, standingDunk: 70 },
  'Face-Up Four':          { hgt:62, stre:62, spd:50, jmp:50, endu:55, ins:65, dnk:52, ft:65, fg:70, tp:45, oiq:62, diq:55, drb:48, pss:45, reb:55, drivingDunk: 42, standingDunk: 48 },
  'Below-Rim Banger':      { hgt:56, stre:92, spd:25, jmp:25, endu:60, ins:80, dnk:45, ft:55, fg:60, tp:25, oiq:65, diq:60, drb:30, pss:45, reb:88, drivingDunk: 25, standingDunk: 65 },
  // C
  'Traditional Center':    { hgt:78, stre:82, spd:30, jmp:50, endu:52, ins:80, dnk:75, ft:45, fg:45, tp:6, oiq:55, diq:72, drb:28, pss:30, reb:82, drivingDunk: 25, standingDunk: 88 },
  'Stretch Big':           { hgt:65, stre:68, spd:38, jmp:48, endu:52, ins:58, dnk:62, ft:62, fg:58, tp:68, oiq:58, diq:60, drb:35, pss:35, reb:65, drivingDunk: 30, standingDunk: 65 },
  'Two-Way Big':           { hgt:65, stre:72, spd:35, jmp:52, endu:55, ins:68, dnk:68, ft:50, fg:50, tp:30, oiq:58, diq:72, drb:30, pss:32, reb:72, drivingDunk: 32, standingDunk: 72 },
  'Offensive Hub':         { hgt:65, stre:68, spd:38, jmp:50, endu:55, ins:72, dnk:68, ft:58, fg:60, tp:45, oiq:70, diq:52, drb:40, pss:58, reb:65, drivingDunk: 38, standingDunk: 75 },
  'Athletic Rim-Runner':   { hgt:74, stre:70, spd:50, jmp:72, endu:58, ins:65, dnk:78, ft:48, fg:48, tp:15, oiq:55, diq:65, drb:38, pss:32, reb:70, drivingDunk: 65, standingDunk: 80 },
  'Undersized Big': { hgt:58, stre:75, spd:65, jmp:68, endu:70, ins:60, dnk:65, ft:65, fg:60, tp:35, oiq:75, diq:85, drb:55, pss:70, reb:75, drivingDunk: 65, standingDunk: 70 },
};

type AgeProfile = {
  noiseStd: number;      // how much randomness in each stat
  potBonus: number;      // added to pot estimator
  potVariance: number;   // how uncertain the ceiling is
  rawnessMod: number;    // pulls weak stats even lower (rawness penalty)
  baseMultiplier: number; // overall multiplier for non-generational stats
};

const AGE_PROFILES: Record<number, AgeProfile> = {
  18: { noiseStd: 14, potBonus: 18, potVariance: 20, rawnessMod: 0.75, baseMultiplier: 0.70 },
  19: { noiseStd: 12, potBonus: 12, potVariance: 16, rawnessMod: 0.82, baseMultiplier: 0.72 },
  20: { noiseStd: 9,  potBonus: 6,  potVariance: 10, rawnessMod: 0.90, baseMultiplier: 0.71 },
  21: { noiseStd: 7,  potBonus: 2,  potVariance: 6,  rawnessMod: 0.96, baseMultiplier: 0.70 },
  22: { noiseStd: 5,  potBonus: 0,  potVariance: 4,  rawnessMod: 1.00, baseMultiplier: 0.72 },
  23: { noiseStd: 4,  potBonus: -3, potVariance: 3,  rawnessMod: 1.00, baseMultiplier: 0.73 },
};

export function potEstimator(ovr: number, age: number): number {
  if (age >= 29) return ovr;
  return 72.31428908571982 + -2.33062761 * age + 0.83308748 * ovr;
}

export function pickWeighted(obj: { [key: string]: number }): string {
  const keys = Object.keys(obj);
  const total = Object.values(obj).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const key of keys) {
    r -= obj[key];
    if (r <= 0) return key;
  }
  return keys[0];
}

/**
 * ARCHETYPE DISTRIBUTION
 * 
 * PG archetypes:
 *   - Primary Creator (35%)
 *   - Scoring Guard (25%)
 *   - Defensive Pest (15%)
 *   - Pass-First Floor Gen (15%)
 *   - Two-Way PG (10%)
 * 
 * SG archetypes:
 *   - Shooting Specialist (25%)
 *   - Slasher (20%)
 *   - 3&D Wing (20%)
 *   - Combo Scorer (20%)
 *   - Defensive Stopper (15%)
 * 
 * SF archetypes:
 *   - All-Around Wing (25%)
 *   - 3&D Forward (20%)
 *   - Athletic Finisher (20%)
 *   - Point Forward (15%)
 *   - Defensive Wing (20%)
 * 
 * PF archetypes:
 *   - Stretch Four (25%)
 *   - Power Forward (25%)
 *   - Two-Way Forward (20%)
 *   - Athletic Four (15%)
 *   - Face-Up Four (15%)
 * 
 * C archetypes:
 *   - Traditional Center (25%)
 *   - Stretch Big (20%)
 *   - Two-Way Big (20%)
 *   - Offensive Hub (15%)
 *   - Athletic Rim-Runner (20%)
 */

function getArchetypeSelection(pos: string): string {
  const r = Math.random() * 100;
  if (pos === 'PG') {
    if (r < 25) return 'Primary Creator';
    if (r < 45) return 'Scoring Guard';
    if (r < 55) return 'Defensive Pest';
    if (r < 65) return 'Pass-First Floor Gen';
    if (r < 75) return 'Two-Way PG';
    if (r < 85) return 'Jumbo Playmaker';
    if (r < 93) return 'Explosive Slasher';
    return 'Limitless Sniper';
  }
  if (pos === 'SG') {
    if (r < 20) return 'Shooting Specialist';
    if (r < 40) return 'Slasher';
    if (r < 60) return '3&D Wing';
    if (r < 75) return 'Combo Scorer';
    if (r < 85) return 'Defensive Stopper';
    if (r < 92) return 'Non-Scoring Lockdown';
    return 'Movement Shooter';
  }
  if (pos === 'SF') {
    if (r < 20) return 'All-Around Wing';
    if (r < 40) return '3&D Forward';
    if (r < 55) return 'Athletic Finisher';
    if (r < 65) return 'Point Forward';
    if (r < 75) return 'Defensive Wing';
    if (r < 85) return 'Non-Scoring Lockdown';
    return 'Swiss Army Knife';
  }
  if (pos === 'PF') {
    if (r < 20) return 'Stretch Four';
    if (r < 40) return 'Power Forward';
    if (r < 55) return 'Two-Way Forward';
    if (r < 70) return 'Athletic Four';
    if (r < 85) return 'Face-Up Four';
    return 'Below-Rim Banger';
  }
  if (pos === 'C') {
    if (r < 20) return 'Traditional Center';
    if (r < 35) return 'Stretch Big';
    if (r < 55) return 'Two-Way Big';
    if (r < 70) return 'Offensive Hub';
    if (r < 85) return 'Athletic Rim-Runner';
    return 'Undersized Big';
  }
  return 'All-Around Wing';
}

export function generateDraftClass(year: number, count: number, rng: () => number, nameData: NameData, path: Player['path'] = 'College', currentSimYear?: number): Player[] {
  const prospects: Player[] = [];
  for (let i = 0; i < count; i++) {
    prospects.push(generateProspect(year, rng, nameData, path, currentSimYear));
  }
  return prospects;
}

function generateProspect(year: number, rng: () => number, nameData: NameData, path: Player['path'], currentSimYear?: number): Player {
  // Determine realistic age distribution (modifying user's stats of ~60% seniors -> ~40% to bump sophomores/juniors)
  // `draftAge` is the age the prospect will be AT the draft (classic distribution).
  // `age` is their CURRENT age (at the sim's current season) — that's what drives ratings
  // so prospects synthesized 3 years out don't get draft-level skills right now.
  const ageRoll = rng();
  let draftAge: number;

  if (path === 'College') {
    if (ageRoll < 0.04) draftAge = 18;      // Early Freshmen (4%)
    else if (ageRoll < 0.24) draftAge = 19; // Freshmen (20%)
    else if (ageRoll < 0.39) draftAge = 20; // Sophomores (15%)
    else if (ageRoll < 0.59) draftAge = 21; // Juniors (20%)
    else if (ageRoll < 0.93) draftAge = 22; // Seniors (34%)
    else draftAge = 23;                     // Super Seniors (7%)
  } else {
    // International / OTE / G-League
    if (ageRoll < 0.30) draftAge = 18;
    else if (ageRoll < 0.65) draftAge = 19;
    else if (ageRoll < 0.80) draftAge = 20;
    else if (ageRoll < 0.90) draftAge = 21;
    else draftAge = 22;
  }

  // Rewind to current age if this class is more than one year out.
  // yearsUntilDraft = 0 → age = draftAge (current class, standard behavior)
  // yearsUntilDraft = 3 → age = draftAge - 3 (raw HS kid scouted 3 years ahead)
  const yearsUntilDraft = currentSimYear != null ? Math.max(0, year - currentSimYear) : 0;
  const age = Math.max(15, draftAge - yearsUntilDraft);

  // Determine Position
  const posKeys: Position[] = ['PG', 'SG', 'SG/SF', 'SF', 'SF/PF', 'PF', 'PF/C', 'C'];
  const pos = posKeys[Math.floor(rng() * posKeys.length)];
  const primaryPos = pos.split('/')[0] as 'PG' | 'SG' | 'SF' | 'PF' | 'C';

  // Archetype
  const archetype = getArchetypeSelection(primaryPos);

  // Nationality
  let nationality = 'USA';
  let college = '';

  if (path === 'College') {
    nationality = pickWeighted(COUNTRY_FREQUENCIES);
    college = pickWeighted(COLLEGE_FREQUENCIES);
  } else if (path === 'NBL') {
    nationality = rng() > 0.5 ? 'Australia' : 'New Zealand';
    const teamIds = Object.keys(NBL_TEAMS);
    college = NBL_TEAMS[teamIds[Math.floor(rng() * teamIds.length)]];
  } else if (path === 'B-League') {
    nationality = 'Japan';
    const teamIds = Object.keys(BLEAGUE_TEAMS);
    college = BLEAGUE_TEAMS[teamIds[Math.floor(rng() * teamIds.length)]];
  } else if (path === 'Europe') {
    const teamIds = Object.keys(EUROLEAGUE_TEAMS);
    const team = EUROLEAGUE_TEAMS[teamIds[Math.floor(rng() * teamIds.length)]];
    college = team.name;
    const euroCountries = ['France', 'Serbia', 'Greece', 'Lithuania', 'Slovenia', 'Turkey', 'Germany', 'Italy', 'Spain', 'Croatia', 'Latvia', 'Russia'];
    nationality = rng() < 0.7 ? team.country : euroCountries[Math.floor(rng() * euroCountries.length)];
  } else if (path === 'Endesa') {
    const teamIds = Object.keys(ENDESA_TEAMS);
    college = ENDESA_TEAMS[teamIds[Math.floor(rng() * teamIds.length)]];
    nationality = rng() > 0.3 ? 'Spain' : pickWeighted(COUNTRY_FREQUENCIES);
  } else {
    nationality = pickWeighted(COUNTRY_FREQUENCIES);
    college = 'Unknown';
  }

  // Defensive: names gist schema varies between ZenGM versions. Fall through country → USA →
  // any populated entry → literal defaults so the generator never crashes on a lookup miss.
  const countryData =
    nameData.countries[nationality] ||
    nameData.countries['USA'] ||
    Object.values(nameData.countries).find((c: any) => c?.first && Object.keys(c.first).length > 0);
  const firstPool = countryData?.first && Object.keys(countryData.first).length > 0
    ? countryData.first : { Anthony: 1, James: 1, Chris: 1, Marcus: 1, Kevin: 1 };
  const lastPool = countryData?.last && Object.keys(countryData.last).length > 0
    ? countryData.last : { Williams: 1, Johnson: 1, Brown: 1, Jones: 1, Davis: 1 };
  const firstName = pickWeighted(firstPool);
  const lastName = pickWeighted(lastPool);

  // Base ratings distribution
  const ratings: any = { season: year };
  const attrs: (keyof Ratings)[] = ['hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb'];

  const profile = ARCHETYPE_PROFILES[archetype];

  // Class quality scalar (bust / avg / star)
  const classRoll = rng();
  let qualityMod = 0;
  if (classRoll < 0.02) qualityMod = 20;       // star
  else if (classRoll < 0.07) qualityMod = -15; // bust
  else qualityMod = randomNormal(0, 8)();       // normal

  const ageProfile = { ...(AGE_PROFILES[Math.min(age, 23)] ?? AGE_PROFILES[23]) };
  const isGenerational = age <= 20 && rng() < 0.002;

  if (isGenerational) {
    // Skip rawness suppression, force star quality, cap pot at 95+
    qualityMod = 20 + randomNormal(0, 4)();
    ageProfile.rawnessMod = 1.0;    // fully polished
    ageProfile.noiseStd = 5;        // very consistent
    ageProfile.baseMultiplier = 1.0; // no overall nerf
  }

  attrs.forEach(attr => {
    const mean = (profile[attr] ?? 50) + qualityMod;
    let val = randomNormal(mean, ageProfile.noiseStd)();        // noise based on age

    // Rawness: suppress stats below their archetype mean for young players
    // Strong stats stay strong, weak stats get weaker
    if (val < mean) {
      val = mean + (val - mean) * (1 / ageProfile.rawnessMod);
    }

    // Nerf all attributes except height to look like a prospect, not a finished product
    if (attr !== 'hgt') {
      val *= ageProfile.baseMultiplier;
    }

    ratings[attr] = Math.max(0, Math.min(99, Math.round(val)));
  });

  // Calculate OVR for ratings object
  const nonHgtAttrs = attrs.filter(a => a !== 'hgt');
  const ovrSum = nonHgtAttrs.reduce((sum, a) => sum + (ratings[a] || 0), 0);
  ratings.ovr = Math.round(ovrSum / nonHgtAttrs.length);

  // NOTE: In-game connection -> potential is a reflection of maximum expected OVR progression over time.
  // The actual simulation engine will recalculate overall as attributes rise over 3-6 seasons.
  if (isGenerational) {
    ratings.pot = Math.round(90 + rng() * 9);
  } else if (age >= 22 && ratings.ovr >= 55) {
    ratings.pot = Math.round(
      ratings.ovr + randomNormal(3, 3)()  // pot only slightly above ovr
    );
  } else {
    ratings.pot = Math.round(ratings.ovr + ageProfile.potBonus + randomNormal(0, ageProfile.potVariance)());
  }

  // Height and Weight
  // The user stated hgt is 68-90 inches, most 75-84. The BBGM rating is 0-99.
  // We'll calculate the sim-rating `hgt` first, then derive actual size.
  // Weight is correlated with height and strength
  const hgtInches = 68 + Math.round((ratings.hgt / 99) * 22);
  const targetBMI = 20 + (ratings.stre / 99) * 8;
  const weightLbs = Math.round((targetBMI * Math.pow(hgtInches, 2)) / 703);

  let drivingDunk = 0;
  let standingDunk = 0;

  const DUNK_ATTRS = ['drivingDunk', 'standingDunk'] as const;

  for (const attr of DUNK_ATTRS) {
    const mean = (profile[attr] ?? 30) + qualityMod;
    let val = randomNormal(mean, ageProfile.noiseStd)();
    
    if (val < mean) {
      val = mean + (val - mean) * (1 / ageProfile.rawnessMod);
    }
    
    if (attr !== 'drivingDunk') {
      val *= ageProfile.baseMultiplier;
    }

    const result = Math.max(0, Math.min(99, Math.round(val)));
    if (attr === 'drivingDunk') drivingDunk = result;
    if (attr === 'standingDunk') standingDunk = result;
  }

  let durability = 50 + (rng() * 35); // 80% uniform 50-85 (approx)
  if (rng() < 0.15) durability = 30 + (rng() * 20); // 15% low
  if (rng() < 0.05) durability = 85 + (rng() * 14); // 5% iron man
  durability = Math.max(0, Math.min(99, Math.round(durability)));

  let composure = randomNormal(60, 20)();
  let clutch = randomNormal(65, 15)();
  let workEthic = randomNormal(65, 18)();

  // Traits
  const traits: MoodTrait[] = [];
  if (rng() < 0.8) {
    const corePool: MoodTrait[] = ['DIVA', 'LOYAL', 'MERCENARY', 'COMPETITOR'];
    const coreWeights: Record<string, number> = { DIVA: 1, LOYAL: 1, MERCENARY: 1, COMPETITOR: 1 };
    
    if (archetype === 'Primary Creator' || archetype === 'Offensive Hub' || archetype === 'Shooting Specialist') coreWeights.DIVA = 3;
    if (archetype.includes('Defensive') || archetype.includes('3&D') || archetype.includes('Two-Way')) {
      coreWeights.LOYAL = 2;
      coreWeights.COMPETITOR = 2;
    }
    if (archetype === 'Athletic Finisher') {
      coreWeights.MERCENARY = 2;
      coreWeights.COMPETITOR = 2;
    }

    const trait = pickWeighted(coreWeights) as MoodTrait;
    traits.push(trait);
  }

  // Modifiers
  const mods: MoodTrait[] = ['VOLATILE', 'AMBASSADOR', 'DRAMA_MAGNET', 'FAME'];
  const modRoll = rng();
  let numMods = 0;
  if (modRoll < 0.05) numMods = 2;
  else if (modRoll < 0.35) numMods = 1;

  for (let j = 0; j < numMods; j++) {
    const mod = mods[Math.floor(rng() * mods.length)];
    const isExcluded = TRAIT_EXCLUSIONS.some(pair => 
      (traits.includes(pair[0]) && mod === pair[1]) || (traits.includes(pair[1]) && mod === pair[0])
    );
    if (!isExcluded && !traits.includes(mod)) {
      traits.push(mod);
    }
  }

  // Trait biases for composure/clutch
  if (traits.includes('LOYAL') || traits.includes('AMBASSADOR')) composure += 10;
  if (traits.includes('DRAMA_MAGNET') || traits.includes('VOLATILE')) composure -= 15;
  if (traits.includes('COMPETITOR')) clutch += 8;
  if (ratings.ovr >= 70) clutch += 5;
  if (ratings.ovr <= 50) clutch -= 5;

  composure = Math.max(10, Math.min(99, Math.round(composure)));
  clutch = Math.max(20, Math.min(99, Math.round(clutch)));
  workEthic = Math.max(15, Math.min(99, Math.round(workEthic)));

  // Determine Race
  const raceFreqs = getRaceFrequencies(nationality);
  const race = pickWeighted(raceFreqs) as "black" | "asian" | "brown" | "white";
  const face = generateFace({ race });

  return {
    id: Math.random().toString(36).substr(2, 9),
    firstName,
    lastName,
    pos,
    age,
    // born.year reflects the sim's CURRENT year — derived so (currentSim − born) = current age.
    // If currentSimYear wasn't passed, fall back to original draft-year math.
    born: { year: (currentSimYear ?? year) - age, loc: nationality },
    hgt: hgtInches,
    weight: weightLbs,
    finalHgt: hgtInches,
    finalWeight: weightLbs,
    college,
    nationality,
    race,
    face,
    draft: { year: year + 1, round: 0, pick: 0, tid: -1 },
    ratings: [ratings as Ratings],
    path,
    drivingDunk,
    standingDunk,
    durability,
    composure,
    clutch,
    workEthic,
    traits,
    archetype,
    overallRating: ratings.ovr,
    status: 'Draft Prospect'
  };
}

// Keep generatePlayer for single player generation if needed, mapping to generateProspect
export async function generatePlayer(nameData: NameData, options: { year: number, path?: Player['path'] }): Promise<Player> {
  return generateProspect(options.year, Math.random, nameData, options.path || 'College');
}

// ─── Adapter: Sandbox Player → NBAPlayer ────────────────────────────────────
// The generator's internal Player type is optimized for prospect generation (face, rawness,
// path, etc). Our game's state model uses NBAPlayer from src/types.ts. This adapter converts
// a generated prospect into a draft-eligible NBAPlayer that can be merged into state.players.
import type { NBAPlayer } from '../types';

// Generated prospects otherwise overpower the real player pool once they enter the league.
// Scale skill attrs down 20% at adapter time; height + season are untouched (physics don't change).
// Potential is NOT hand-tuned here — it's derived from nerfed OVR + age via the same
// potEstimator the rest of the game uses (see PlayerRatingsModal), so the math stays consistent.
const PROSPECT_NERF = 0.80;
const NERF_SKIP = new Set(['season', 'hgt', 'pot']); // pot recomputed from OVR + age

function nerfRatings(ratings: Ratings[]): Ratings[] {
  return ratings.map(r => {
    const out: any = { ...r };
    for (const key of Object.keys(out)) {
      if (NERF_SKIP.has(key)) continue;
      if (typeof out[key] !== 'number') continue;
      out[key] = Math.max(0, Math.min(99, Math.round(out[key] * PROSPECT_NERF)));
    }
    return out as Ratings;
  });
}

export function sandboxToNBAPlayer(p: Player): NBAPlayer {
  const nerfedRatings = nerfRatings(p.ratings ?? []);
  const lastR = nerfedRatings[nerfedRatings.length - 1];
  const nerfedOvr = Math.round((p.overallRating ?? lastR?.ovr ?? 45) * PROSPECT_NERF);
  // Use the game's canonical potential formula — same one PlayerRatingsModal + retirementChecker call.
  const derivedPot = Math.min(99, Math.max(40, Math.round(potEstimator(nerfedOvr, p.age))));
  // Also patch `pot` inside each ratings row so downstream progression sees consistent numbers.
  const finalRatings = nerfedRatings.map((r, i) =>
    i === nerfedRatings.length - 1 ? { ...r, pot: derivedPot } : r,
  );
  return {
    internalId: p.id,
    name: `${p.firstName} ${p.lastName}`,
    firstName: p.firstName,
    lastName: p.lastName,
    tid: -2,                                   // -2 = draft prospect per codebase convention
    status: 'Draft Prospect',
    pos: p.pos,
    age: p.age,
    born: p.born,
    hgt: p.hgt,
    weight: p.weight,
    college: p.college,
    imgURL: p.imgURL,
    draft: {
      year: p.draft.year,
      round: p.draft.round ?? 0,
      pick: p.draft.pick ?? 0,
      tid: p.draft.tid ?? -1,
      originalTid: p.draft.tid ?? -1,
    },
    ratings: finalRatings as any,
    overallRating: nerfedOvr,
    potential: derivedPot,
    moodTraits: p.traits as any,
    // Expose the extra generated attrs so downstream systems (progression, clutch, fight) can read them.
    ...( { drivingDunk: p.drivingDunk, standingDunk: p.standingDunk, durability: p.durability,
      composure: p.composure, clutch: p.clutch, workEthic: p.workEthic, archetype: p.archetype,
      face: p.face, finalHgt: p.finalHgt, finalWeight: p.finalWeight, nationality: p.nationality,
      race: p.race, path: p.path } as any ),
  } as NBAPlayer;
}

/**
 * Convenience wrapper — generates a full draft class already shaped as NBAPlayer[].
 * Mix respects the real-NBA pipeline mix: majority NCAA + international + G-League,
 * so international scouting / home-country affinity / overseas-path logic in
 * generateProspect stays honored.
 *
 *   ~70% College
 *   ~10% Europe (Euroleague)
 *   ~6%  G-League
 *   ~6%  Endesa
 *   ~4%  NBL Australia
 *   ~4%  Japan B-League
 *
 * Hook this into seasonRollover.ts after the next-year bump to synthesize each
 * season's incoming class without needing a fresh BBGM import.
 */
const DRAFT_PATH_MIX: Array<{ path: Player['path']; weight: number }> = [
  { path: 'College',  weight: 70 },
  { path: 'Europe',   weight: 10 },
  { path: 'G-League', weight: 6 },
  { path: 'Endesa',   weight: 6 },
  { path: 'NBL',      weight: 4 },
  { path: 'B-League', weight: 4 },
];

function samplePath(rng: () => number): Player['path'] {
  const total = DRAFT_PATH_MIX.reduce((s, m) => s + m.weight, 0);
  let roll = rng() * total;
  for (const m of DRAFT_PATH_MIX) {
    roll -= m.weight;
    if (roll <= 0) return m.path;
  }
  return 'College';
}

export function generateDraftClassForGame(
  year: number,              // draft year (e.g. 2029 for the 2029 class)
  count: number,
  rng: () => number,
  nameData: NameData,
  currentSimYear?: number,   // sim's current year — lets us age-down prospects for future classes
): NBAPlayer[] {
  // Build the class per-prospect so each pick rolls a realistic path mix.
  const prospects: Player[] = [];
  for (let i = 0; i < count; i++) {
    const path = samplePath(rng);
    // Delegate to the original generator — handles country affinity, race, archetype, etc.
    const single = generateDraftClass(year, 1, rng, nameData, path, currentSimYear);
    if (single[0]) prospects.push(single[0]);
  }
  return prospects.map(sandboxToNBAPlayer);
}
