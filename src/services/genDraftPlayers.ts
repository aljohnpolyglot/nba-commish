import { randomNormal } from 'd3-random';
import { generate as generateFaceRaw } from 'facesjs';
// Basketball-only face generation:
// facesjs ships jerseys/accessories for multiple sports/holiday themes, so
// constrain generated prospects to basketball jerseys and basketball-plausible
// accessories only.
const BASKETBALL_JERSEY_IDS = ['jersey', 'jersey2', 'jersey3', 'jersey4', 'jersey5'] as const;
const BASKETBALL_ACCESSORY_IDS = ['none', 'headband', 'headband-high'] as const;
const generateFace = (opts?: { race?: string; gender?: 'male' | 'female' }): any => {
  const jerseyId = BASKETBALL_JERSEY_IDS[Math.floor(Math.random() * BASKETBALL_JERSEY_IDS.length)];
  const accessoryId = BASKETBALL_ACCESSORY_IDS[Math.floor(Math.random() * BASKETBALL_ACCESSORY_IDS.length)];
  const face = generateFaceRaw({
    jersey: { id: jerseyId },
    accessories: { id: accessoryId },
  }, opts as any);
  return face;
};

import { Player, Position, Ratings, NameData, MoodTrait } from '../genplayersconstants';
import { COLLEGE_FREQUENCIES, COUNTRY_FREQUENCIES, EUROLEAGUE_TEAMS, ENDESA_TEAMS, NBL_TEAMS, BLEAGUE_TEAMS, getRaceFrequencies } from '../genplayersconstants';
import { pickJerseyNumber } from '../utils/jerseyUtils';
import {
  PATH_OVR_CAP, LEAGUE_HEIGHT_CEILING, PATH_TO_LEAGUE,
  COUNTRY_HEIGHT_MULT, YOUTH_EXTERNAL_OVR_CAP,
} from '../constants';

// Deterministic seeded RNG for stratified draft sampling (Fix 16).
function seededRng(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

const TRAIT_EXCLUSIONS: [MoodTrait, MoodTrait][] = [
  ['LOYAL', 'MERCENARY'],
  ['AMBASSADOR', 'DRAMA_MAGNET'],
  ['DIVA', 'AMBASSADOR'],
];

export const ARCHETYPE_PROFILES: Record<string, Record<string, number>> = {
  // PG
  'Primary Creator':       { hgt:30, stre:35, spd:72, jmp:55, endu:60, ins:40, dnk:45, ft:65, fg:60, tp:55, oiq:75, diq:35, drb:80, pss:75, reb:30, drivingDunk: 58, standingDunk: 15 }, // Chris Paul, Trae Young
  'Scoring Guard':         { hgt:25, stre:35, spd:65, jmp:55, endu:55, ins:35, dnk:50, ft:68, fg:65, tp:65, oiq:60, diq:30, drb:65, pss:50, reb:25, drivingDunk: 62, standingDunk: 18 }, // Damian Lillard, Kyrie Irving
  'Defensive Pest':        { hgt:28, stre:50, spd:70, jmp:60, endu:65, ins:30, dnk:40, ft:50, fg:45, tp:40, oiq:55, diq:75, drb:60, pss:55, reb:40, drivingDunk: 55, standingDunk: 14 }, // Patrick Beverley, Jose Alvarado
  'Pass-First Floor Gen':  { hgt:28, stre:35, spd:65, jmp:45, endu:60, ins:30, dnk:35, ft:60, fg:50, tp:45, oiq:80, diq:38, drb:75, pss:85, reb:30, drivingDunk: 45, standingDunk: 10 }, // Rajon Rondo, Tyrese Haliburton
  'Two-Way PG':            { hgt:32, stre:50, spd:68, jmp:58, endu:62, ins:35, dnk:48, ft:58, fg:55, tp:52, oiq:68, diq:68, drb:70, pss:65, reb:38, drivingDunk: 60, standingDunk: 16 }, // Jrue Holiday, Derrick White
  'Jumbo Playmaker':       { hgt:48, stre:58, spd:62, jmp:55, endu:65, ins:45, dnk:55, ft:68, fg:60, tp:62, oiq:82, diq:42, drb:82, pss:85, reb:55, drivingDunk: 55, standingDunk: 25 }, // Luka Doncic, LaMelo Ball
  'Explosive Slasher':     { hgt:28, stre:45, spd:85, jmp:90, endu:65, ins:50, dnk:70, ft:65, fg:55, tp:35, oiq:65, diq:30, drb:80, pss:60, reb:35, drivingDunk: 88, standingDunk: 20 }, // Ja Morant, De'Aaron Fox
  'Limitless Sniper':      { hgt:25, stre:30, spd:70, jmp:45, endu:75, ins:35, dnk:25, ft:90, fg:65, tp:92, oiq:85, diq:25, drb:85, pss:70, reb:25, drivingDunk: 35, standingDunk: 5  }, // Stephen Curry, Damian Lillard
  // SG
  'Shooting Specialist':   { hgt:35, stre:35, spd:60, jmp:50, endu:55, ins:35, dnk:45, ft:80, fg:72, tp:80, oiq:60, diq:30, drb:50, pss:40, reb:30, drivingDunk: 42, standingDunk: 12 }, // Klay Thompson, Buddy Hield
  'Volume Scorer':         { hgt:34, stre:45, spd:75, jmp:65, endu:80, ins:55, dnk:60, ft:82, fg:75, tp:70, oiq:72, diq:28, drb:82, pss:55, reb:35, drivingDunk: 65, standingDunk: 20 }, // Allen Iverson, Bradley Beal
  'Mid-Range Maestro':     { hgt:48, stre:65, spd:55, jmp:55, endu:75, ins:70, dnk:60, ft:88, fg:92, tp:25, oiq:80, diq:32, drb:75, pss:50, reb:45, drivingDunk: 68, standingDunk: 35 }, // DeMar DeRozan, Shaun Livingston
  'Slasher':               { hgt:38, stre:55, spd:75, jmp:72, endu:60, ins:50, dnk:78, ft:65, fg:60, tp:35, oiq:58, diq:38, drb:68, pss:45, reb:38, drivingDunk: 85, standingDunk: 30 }, // Anthony Edwards, Zach LaVine
  '3&D Wing':              { hgt:42, stre:50, spd:62, jmp:55, endu:60, ins:38, dnk:50, ft:70, fg:60, tp:72, oiq:58, diq:70, drb:48, pss:42, reb:40, drivingDunk: 52, standingDunk: 18 }, // Danny Green, Kentavious Caldwell-Pope
  'Combo Scorer':          { hgt:45, stre:42, spd:65, jmp:58, endu:58, ins:42, dnk:58, ft:68, fg:65, tp:62, oiq:62, diq:35, drb:60, pss:48, reb:35, drivingDunk: 62, standingDunk: 22 }, // Devin Booker, Donovan Mitchell
  'Defensive Stopper':     { hgt:40, stre:58, spd:68, jmp:62, endu:65, ins:35, dnk:48, ft:52, fg:50, tp:40, oiq:52, diq:80, drb:55, pss:42, reb:45, drivingDunk: 55, standingDunk: 20 }, // Marcus Smart, Alex Caruso
  'Non-Scoring Lockdown':  { hgt:45, stre:68, spd:72, jmp:65, endu:75, ins:35, dnk:45, ft:40, fg:35, tp:20, oiq:35, diq:88, drb:40, pss:35, reb:50, drivingDunk: 50, standingDunk: 25 }, // Matisse Thybulle, Andre Roberson
  'Movement Shooter':      { hgt:45, stre:35, spd:55, jmp:45, endu:65, ins:30, dnk:35, ft:85, fg:60, tp:85, oiq:65, diq:25, drb:40, pss:35, reb:30, drivingDunk: 35, standingDunk: 10 }, // JJ Redick, Desmond Bane
  // SF
  'All-Around Wing':       { hgt:47, stre:52, spd:60, jmp:60, endu:60, ins:48, dnk:60, ft:62, fg:60, tp:58, oiq:65, diq:50, drb:55, pss:50, reb:48, drivingDunk: 65, standingDunk: 30 }, // Jayson Tatum, Kawhi Leonard
  'Isolation Specialist':  { hgt:58, stre:50, spd:62, jmp:58, endu:70, ins:65, dnk:60, ft:88, fg:85, tp:60, oiq:80, diq:32, drb:75, pss:55, reb:50, drivingDunk: 65, standingDunk: 40 }, // Kevin Durant, Carmelo Anthony
  '3&D Forward':           { hgt:47, stre:52, spd:58, jmp:55, endu:58, ins:42, dnk:52, ft:68, fg:60, tp:74, oiq:58, diq:70, drb:42, pss:40, reb:45, drivingDunk: 55, standingDunk: 28 }, // Mikal Bridges, OG Anunoby
  'Athletic Finisher':     { hgt:48, stre:58, spd:68, jmp:75, endu:62, ins:52, dnk:80, ft:58, fg:58, tp:30, oiq:55, diq:40, drb:58, pss:42, reb:50, drivingDunk: 88, standingDunk: 45 }, // Andrew Wiggins, Miles Bridges
  'Point Forward':         { hgt:48, stre:50, spd:60, jmp:55, endu:60, ins:50, dnk:55, ft:60, fg:60, tp:50, oiq:72, diq:45, drb:65, pss:70, reb:48, drivingDunk: 60, standingDunk: 32 }, // LeBron James, Scottie Pippen
  'Defensive Wing':        { hgt:52, stre:62, spd:62, jmp:60, endu:65, ins:45, dnk:52, ft:52, fg:50, tp:40, oiq:52, diq:78, drb:48, pss:42, reb:52, drivingDunk: 58, standingDunk: 28 }, // Herb Jones, Bruce Brown
  'Swiss Army Knife':      { hgt:42, stre:60, spd:65, jmp:60, endu:85, ins:50, dnk:50, ft:65, fg:55, tp:50, oiq:65, diq:70, drb:55, pss:50, reb:72, drivingDunk: 55, standingDunk: 15 }, // Draymond Green, Josh Hart
  // PF
  'Stretch Four':          { hgt:62, stre:60, spd:48, jmp:50, endu:55, ins:50, dnk:55, ft:65, fg:60, tp:72, oiq:60, diq:42, drb:42, pss:40, reb:58, drivingDunk: 48, standingDunk: 52 }, // Kristaps Porzingis, Lauri Markkanen
  'Post-Up Master':        { hgt:68, stre:85, spd:40, jmp:45, endu:65, ins:90, dnk:55, ft:72, fg:78, tp:15, oiq:85, diq:65, drb:50, pss:60, reb:85, drivingDunk: 35, standingDunk: 82 }, // Tim Duncan, Kevin McHale
  'Power Forward':         { hgt:64, stre:75, spd:42, jmp:55, endu:58, ins:68, dnk:65, ft:52, fg:52, tp:30, oiq:55, diq:52, drb:38, pss:35, reb:72, drivingDunk: 52, standingDunk: 78 }, // Zion Williamson, Julius Randle
  'Two-Way Forward':       { hgt:62, stre:65, spd:48, jmp:55, endu:60, ins:58, dnk:60, ft:55, fg:55, tp:48, oiq:60, diq:68, drb:42, pss:40, reb:62, drivingDunk: 55, standingDunk: 65 }, // Pascal Siakam, Evan Mobley
  'Athletic Four':         { hgt:62, stre:62, spd:55, jmp:72, endu:60, ins:55, dnk:72, ft:55, fg:52, tp:38, oiq:55, diq:48, drb:48, pss:38, reb:62, drivingDunk: 75, standingDunk: 70 }, // Aaron Gordon, John Collins
  'Face-Up Four':          { hgt:62, stre:62, spd:50, jmp:50, endu:55, ins:65, dnk:52, ft:65, fg:70, tp:45, oiq:62, diq:42, drb:48, pss:45, reb:55, drivingDunk: 42, standingDunk: 48 }, // Chris Bosh, Kevin Garnett
  'Below-Rim Banger':      { hgt:56, stre:92, spd:25, jmp:25, endu:60, ins:80, dnk:45, ft:55, fg:60, tp:25, oiq:65, diq:52, drb:30, pss:45, reb:88, drivingDunk: 25, standingDunk: 65 }, // Zach Randolph, Kevon Looney
  'Stretch Forward':       { hgt:52, stre:48, spd:62, jmp:55, endu:65, ins:42, dnk:52, ft:85, fg:70, tp:85, oiq:68, diq:45, drb:52, pss:45, reb:48, drivingDunk: 58, standingDunk: 25 }, // Cam Johnson, Keegan Murray
  'Elite Spacing Wing':    { hgt:55, stre:52, spd:60, jmp:65, endu:68, ins:55, dnk:62, ft:82, fg:75, tp:88, oiq:72, diq:38, drb:55, pss:42, reb:55, drivingDunk: 65, standingDunk: 35 }, // Michael Porter Jr., Trey Murphy III
  'Switchable Spacer':     { hgt:50, stre:62, spd:65, jmp:60, endu:72, ins:45, dnk:55, ft:72, fg:55, tp:78, oiq:65, diq:78, drb:48, pss:45, reb:52, drivingDunk: 60, standingDunk: 20 }, // Dorian Finney-Smith, P.J. Washington
  'High-Energy Finisher':  { hgt:58, stre:78, spd:68, jmp:88, endu:85, ins:82, dnk:85, ft:60, fg:45, tp:5,  oiq:60, diq:40, drb:45, pss:35, reb:82, drivingDunk: 82, standingDunk: 70 }, // Kenneth Faried, Montrezl Harrell
  // C
  'Traditional Center':    { hgt:78, stre:82, spd:30, jmp:50, endu:52, ins:80, dnk:75, ft:45, fg:45, tp:6,  oiq:55, diq:60, drb:28, pss:30, reb:82, drivingDunk: 25, standingDunk: 88 }, // Rudy Gobert, Clint Capela
  'The Unicorn':           { hgt:74, stre:55, spd:65, jmp:75, endu:65, ins:65, dnk:75, ft:78, fg:70, tp:60, oiq:75, diq:70, drb:60, pss:55, reb:78, drivingDunk: 75, standingDunk: 85 }, // Victor Wembanyama, Chet Holmgren
  'Defensive Anchor':      { hgt:80, stre:85, spd:45, jmp:65, endu:70, ins:55, dnk:65, ft:55, fg:45, tp:5,  oiq:65, diq:95, drb:40, pss:35, reb:88, drivingDunk: 50, standingDunk: 85 }, // Mark Eaton, Dikembe Mutombo
  'Stretch Big':           { hgt:65, stre:68, spd:38, jmp:48, endu:52, ins:58, dnk:62, ft:62, fg:58, tp:68, oiq:58, diq:45, drb:35, pss:35, reb:65, drivingDunk: 30, standingDunk: 65 }, // Karl-Anthony Towns, Brook Lopez
  'Two-Way Big':           { hgt:65, stre:72, spd:35, jmp:52, endu:55, ins:68, dnk:68, ft:50, fg:50, tp:30, oiq:58, diq:72, drb:30, pss:32, reb:72, drivingDunk: 32, standingDunk: 72 }, // Bam Adebayo, Anthony Davis
  'Offensive Hub':         { hgt:65, stre:68, spd:38, jmp:50, endu:55, ins:72, dnk:68, ft:58, fg:60, tp:45, oiq:70, diq:42, drb:40, pss:58, reb:65, drivingDunk: 38, standingDunk: 75 }, // Nikola Jokic, Domantas Sabonis
  'Athletic Rim-Runner':   { hgt:74, stre:70, spd:50, jmp:72, endu:58, ins:65, dnk:78, ft:48, fg:48, tp:15, oiq:55, diq:58, drb:38, pss:32, reb:70, drivingDunk: 65, standingDunk: 80 }, // DeAndre Jordan, Jarrett Allen
  'Undersized Big':        { hgt:58, stre:75, spd:65, jmp:68, endu:70, ins:60, dnk:65, ft:65, fg:60, tp:35, oiq:75, diq:85, drb:55, pss:70, reb:75, drivingDunk: 65, standingDunk: 70 }, // Draymond Green, PJ Tucker
  'Post Specialist':       { hgt:68, stre:80, spd:38, jmp:45, endu:65, ins:92, dnk:55, ft:68, fg:75, tp:10, oiq:72, diq:25, drb:55, pss:35, reb:72, drivingDunk: 35, standingDunk: 78 }, // Jahlil Okafor, Al Jefferson
};

type AgeProfile = {
  noiseStd: number;      // how much randomness in each stat
  potBonus: number;      // added to pot estimator
  potVariance: number;   // how uncertain the ceiling is
  rawnessMod: number;    // pulls weak stats even lower (rawness penalty)
  baseMultiplier: number; // overall multiplier for non-generational stats
};

// Historically-accurate draft age distributions per eligibility era (College path).
// Each entry is [age, weight]. The slider shifts the whole table by an integer offset.
// Sources: Wikipedia draft tables, CBS Sports class-year breakdowns.
const ERA_COLLEGE_DISTRIBUTIONS: Record<string, Array<[number, number]>> = {
  // 2006-present: bimodal — freshmen (19) as lottery darlings, seniors (22) dominating volume.
  // Roughly: 4% age-18 waivers, 20% freshmen, 15% sophs, 20% juniors, 34% seniors, 7% super-seniors.
  one_and_done: [[18, 4],  [19, 20], [20, 15], [21, 20], [22, 34], [23, 7]],
  // 1975-2005: HS seniors (17-18) eligible; peaked at ~15% of all picks ca. 2003-05.
  // College distribution shifts younger — juniors/sophs more common than senior-heavy pre-2006.
  prep_to_pro:  [[17, 3],  [18, 12], [19, 18], [20, 18], [21, 22], [22, 22], [23, 5]],
  // 1971-1975: hardship exemption was selective/financial — mostly seniors still, some juniors.
  hardship:     [[19, 5],  [20, 15], [21, 25], [22, 40], [23, 15]],
  // Pre-1971: strict four-year college rule — almost entirely 22-year-old seniors.
  pre_1970s:    [[21, 5],  [22, 75], [23, 18], [24, 2]],
};

// Weighted mean age of each era's distribution (used to compute slider offset = 0).
const ERA_DEFAULT_MEANS: Record<string, number> = {
  one_and_done: 21, // bimodal 19+22 → weighted mean ~21
  prep_to_pro:  20,
  hardship:     22,
  pre_1970s:    22,
};

function sampleEraAge(eligibilityRule: string, offset: number, rng: () => number): number {
  const dist = ERA_COLLEGE_DISTRIBUTIONS[eligibilityRule] ?? ERA_COLLEGE_DISTRIBUTIONS.one_and_done;
  const total = dist.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [age, weight] of dist) {
    r -= weight;
    if (r <= 0) return Math.max(17, Math.min(26, age + offset));
  }
  return Math.max(17, Math.min(26, dist[dist.length - 1][0] + offset));
}

const AGE_PROFILES: Record<number, AgeProfile> = {
  18: { noiseStd: 14, potBonus: 8,  potVariance: 10, rawnessMod: 0.75, baseMultiplier: 0.70 },
  19: { noiseStd: 12, potBonus: 6,  potVariance: 8,  rawnessMod: 0.82, baseMultiplier: 0.72 },
  20: { noiseStd: 9,  potBonus: 3,  potVariance: 6,  rawnessMod: 0.90, baseMultiplier: 0.71 },
  21: { noiseStd: 7,  potBonus: 1,  potVariance: 4,  rawnessMod: 0.96, baseMultiplier: 0.70 },
  22: { noiseStd: 5,  potBonus: 0,  potVariance: 3,  rawnessMod: 1.00, baseMultiplier: 0.72 },
  23: { noiseStd: 4,  potBonus: -3, potVariance: 2,  rawnessMod: 1.00, baseMultiplier: 0.73 },
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

function generateJerseyNumber(rng: () => number): string {
  return pickJerseyNumber(new Set(), rng);
}

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
    if (r < 15) return 'Shooting Specialist';
    if (r < 25) return 'Volume Scorer';
    if (r < 32) return 'Mid-Range Maestro';
    if (r < 45) return 'Slasher';
    if (r < 60) return '3&D Wing';
    if (r < 75) return 'Combo Scorer';
    if (r < 85) return 'Defensive Stopper';
    if (r < 92) return 'Non-Scoring Lockdown';
    return 'Movement Shooter';
  }
  if (pos === 'SF') {
    if (r < 10) return 'All-Around Wing';
    if (r < 18) return 'Mid-Range Maestro';
    if (r < 28) return 'Isolation Specialist';
    if (r < 38) return 'Volume Scorer';
    if (r < 48) return '3&D Forward';
    if (r < 58) return 'Athletic Finisher';
    if (r < 68) return 'Point Forward';
    if (r < 78) return 'Defensive Wing';
    if (r < 85) return 'Non-Scoring Lockdown';
    return 'Swiss Army Knife';
  }
  if (pos === 'PF') {
    if (r < 9)  return 'Stretch Four';
    if (r < 17) return 'Isolation Specialist';
    if (r < 25) return 'Post-Up Master';
    if (r < 34) return 'Power Forward';
    if (r < 43) return 'Two-Way Forward';
    if (r < 51) return 'Athletic Four';
    if (r < 59) return 'Face-Up Four';
    if (r < 68) return 'Below-Rim Banger';
    if (r < 77) return 'Stretch Forward';
    if (r < 85) return 'Elite Spacing Wing';
    if (r < 93) return 'Switchable Spacer';
    return 'High-Energy Finisher';
  }
  if (pos === 'C') {
    if (r < 10) return 'Traditional Center';
    if (r < 20) return 'The Unicorn';
    if (r < 30) return 'Defensive Anchor';
    if (r < 40) return 'Stretch Big';
    if (r < 50) return 'Two-Way Big';
    if (r < 60) return 'Offensive Hub';
    if (r < 70) return 'Athletic Rim-Runner';
    if (r < 80) return 'Undersized Big';
    if (r < 90) return 'Post Specialist';
    return 'High-Energy Finisher';
  }
  return 'All-Around Wing';
}

export function generateDraftClass(year: number, count: number, rng: () => number, nameData: NameData, path: Player['path'] = 'College', currentSimYear?: number, eligibilityRule?: string, forcedOvrBand?: OvrBand): Player[] {
  const prospects: Player[] = [];
  for (let i = 0; i < count; i++) {
    prospects.push(generateProspect(year, rng, nameData, path, currentSimYear, eligibilityRule, forcedOvrBand));
  }
  return prospects;
}

/** Internal stratified band passed from generateDraftClassForGame. */
type OvrBand = { min: number; max: number; qualityBias: number; potMin?: number; potMax?: number };

function generateProspect(year: number, rng: () => number, nameData: NameData, path: Player['path'], currentSimYear?: number, eligibilityRule?: string, forcedOvrBand?: OvrBand): Player {
  // `draftAge` is the age the prospect will be AT the draft.
  // `age` is their CURRENT age (at the sim's current season) — drives ratings so prospects
  // synthesized for future classes don't arrive at draft-level skills too early.
  //
  // College: sample from the era's historically-accurate bucket distribution.
  // International: normal distribution centered 1 year below the era's default mean.
  const rule = eligibilityRule ?? 'one_and_done';
  const eraDefault = ERA_DEFAULT_MEANS[rule] ?? 21;

  let draftAge: number;
  if (path === 'College') {
    draftAge = sampleEraAge(rule, 0, rng);
  } else {
    const intlCenter = Math.max(17, eraDefault - 1);
    const rawAge = Math.round(randomNormal(intlCenter, 1.2)());
    draftAge = Math.max(17, Math.min(26, rawAge));
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
  if (forcedOvrBand) {
    // Stratified band: bias qualityMod toward the target and let it still be noisy
    qualityMod = forcedOvrBand.qualityBias + randomNormal(0, 4)();
  } else if (classRoll < 0.02) qualityMod = 20;       // star
  else if (classRoll < 0.07) qualityMod = -15; // bust
  else qualityMod = randomNormal(0, 8)();       // normal

  const ageProfile = { ...(AGE_PROFILES[Math.min(age, 23)] ?? AGE_PROFILES[23]) };
  const isGenerational = forcedOvrBand?.min != null && forcedOvrBand.min >= 53
    ? true  // tier-1 slot is always a generational talent
    : age <= 20 && rng() < 0.002;

  if (isGenerational) {
    // Hype tag, not mechanical immunity: they stand out at draft but can still
    // bust via the devSpeed lottery and yearly POT drift. Keep the quality-boost
    // and tighter consistency, but leave rawness + base multiplier alone so they
    // still look like a prospect, not a finished product.
    qualityMod = 20 + randomNormal(0, 4)();
    ageProfile.noiseStd = 5;         // tighter per-attr noise
    ageProfile.potBonus += 4;        // scouts project them higher
    ageProfile.potVariance += 2;
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

  // ── Fix 3: Per-league OVR cap (non-College paths) ───────────────────────────
  const pathOvrCap = PATH_OVR_CAP[path];
  if (pathOvrCap !== undefined) {
    // Fix 6: USA imports in foreign leagues are journeymen, not stars
    const usaPenalty = (nationality === 'USA' && path !== 'G-League') ? 8 : 0;
    const effectiveOvrCap = pathOvrCap - usaPenalty;
    ratings.ovr = Math.min(ratings.ovr, effectiveOvrCap);
  }

  // Fix 16: Clamp to forced OVR band if provided (stratified sampling)
  if (forcedOvrBand) {
    ratings.ovr = Math.max(forcedOvrBand.min, Math.min(forcedOvrBand.max, ratings.ovr));
  }

  // Fix 9: Youth hard cap — fires AFTER band clamp so elite bands can't bypass it.
  // Applies to ALL paths: a 15yo "College" prospect is still a kid.
  // Graded: age<16 → K2~62, age<17 → K2~67, age<18 → K2~70, age<19 → K2~73
  if (age < 19) {
    const youthCap = age < 16 ? 34 : age < 17 ? 39 : age < 18 ? 44 : YOUTH_EXTERNAL_OVR_CAP;
    ratings.ovr = Math.min(ratings.ovr, youthCap);
  }

  // NOTE: In-game connection -> potential is a reflection of maximum expected OVR progression over time.
  // The actual simulation engine will recalculate overall as attributes rise over 3-6 seasons.
  if (age >= 22 && ratings.ovr >= 55) {
    ratings.pot = Math.round(
      ratings.ovr + randomNormal(3, 3)()  // pot only slightly above ovr
    );
  } else {
    // Generational bumped potBonus/potVariance above, so they still skew high
    // but are no longer guaranteed 90+.
    ratings.pot = Math.round(ratings.ovr + ageProfile.potBonus + randomNormal(0, ageProfile.potVariance)());
  }

  // Fix 3: POT cap = leagueOvrCap + 8 (youth) / +4 (adult 22+)
  if (pathOvrCap !== undefined) {
    const potCap = age < 22 ? pathOvrCap + 8 : pathOvrCap + 4;
    ratings.pot = Math.min(ratings.pot, potCap);
  }
  // Fix 9: Youth POT stays high even with OVR cap (elite 15yo can have POT 95+)
  // — no pot cap for youth, only OVR is capped.

  // Hidden development-trajectory scalar — drives the bust rate for hyped prospects.
  // Seeded once here; ProgressionEngine multiplies calcBaseChange by it each year.
  // Combined with yearly POT-blend in seasonRollover, slow developers see their
  // stored POT drift down over 3–5 seasons (the visible bust).
  // Threshold 70 is BBGM-scale (converts to ~2K 85+) — anyone scouts are hyped on.
  const devRoll = rng();
  if (devRoll < 0.05) {
    ratings.devSpeed = 1.15 + rng() * 0.25;            // hidden gem (~5%)
  } else if (devRoll < 0.25 && ratings.pot >= 70) {
    ratings.devSpeed = 0.55 + rng() * 0.25;            // under-developer (~20% of hyped prospects)
  } else {
    ratings.devSpeed = 0.90 + rng() * 0.20;            // normal jitter
  }

  // Height and Weight
  // The BBGM hgt attribute (0-99) maps to 68-90 inches. Apply country multiplier
  // then league ceiling before deriving bio height and weight.
  let hgtInches = 68 + Math.round((ratings.hgt / 99) * 22);

  // Fix 5: Per-country height multiplier (ethnic stature variation)
  const hgtMult = COUNTRY_HEIGHT_MULT[nationality] ?? 1.0;
  if (hgtMult !== 1.0) hgtInches = Math.round(hgtInches * hgtMult);

  // Fix 4: Per-league height ceiling
  const leagueName = PATH_TO_LEAGUE[path] ?? 'NBA';
  const hgtCeil = LEAGUE_HEIGHT_CEILING[leagueName] ?? 90;
  hgtInches = Math.min(hgtInches, hgtCeil);

  // Back-derive hgt rating from adjusted bio height
  ratings.hgt = Math.round(Math.max(0, Math.min(99, ((hgtInches - 68) / 22) * 99)));

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
  const jerseyNumber = generateJerseyNumber(rng);

  return {
    id: Math.random().toString(36).substr(2, 9),
    firstName,
    lastName,
    jerseyNumber,
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
    draft: { year: year, round: 0, pick: 0, tid: -1 },
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

export function sandboxToNBAPlayer(p: Player): NBAPlayer {
  const rawRatings = p.ratings ?? [];
  const lastR = rawRatings[rawRatings.length - 1];
  const baseOvr = p.overallRating ?? lastR?.ovr ?? 45;
  // Use the game's canonical potential formula — same one PlayerRatingsModal + retirementChecker call.
  const derivedPot = Math.min(99, Math.max(40, Math.round(potEstimator(baseOvr, p.age))));
  // Patch `pot` inside the last ratings row so downstream progression sees consistent numbers.
  const finalRatings = rawRatings.map((r, i) =>
    i === rawRatings.length - 1 ? { ...r, pot: derivedPot } : r,
  );
  return {
    internalId: p.id,
    name: `${p.firstName} ${p.lastName}`,
    firstName: p.firstName,
    lastName: p.lastName,
    jerseyNumber: p.jerseyNumber,
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
    overallRating: baseOvr,
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

// ── Fix 16: Stratified draft-class talent bands ──────────────────────────────
// OVR at draft reflects raw prospect level, not finished product.
// K2 84 → BBGM 60, K2 79 → BBGM 55, K2 73 → BBGM 48, K2 68 → BBGM 42, K2 62 → BBGM 35.
// POT is set separately per band — potEstimator alone inflates every tier-2 pick to K2 99.
const DRAFT_BANDS: Array<{ min: number; max: number; qualityBias: number; baseCount: number; extraRoll: number; potMin?: number; potMax?: number }> = [
  { min: 53, max: 61, qualityBias: 22, potMin: 72, potMax: 82, baseCount: 0, extraRoll: 1 }, // Generational: K2 78-85 OVR, POT K2 94-99
  { min: 44, max: 53, qualityBias: 12, potMin: 61, potMax: 72, baseCount: 2, extraRoll: 1 }, // Franchise:    K2 70-78 OVR, POT K2 85-94
  { min: 37, max: 46, qualityBias:  4, potMin: 54, potMax: 64, baseCount: 4, extraRoll: 2 }, // Lottery:      K2 64-72 OVR, POT K2 79-87
  { min: 31, max: 39, qualityBias: -3, potMin: 46, potMax: 56, baseCount: 8, extraRoll: 2 }, // Late 1st:     K2 58-65 OVR, POT K2 72-80
  { min: 24, max: 34, qualityBias: -9, potMin: 37, potMax: 48, baseCount: 15, extraRoll: 3 }, // Early 2nd:   K2 52-61 OVR, POT K2 64-73
];

export function generateDraftClassForGame(
  year: number,              // draft year (e.g. 2029 for the 2029 class)
  count: number,
  rng: () => number,
  nameData: NameData,
  currentSimYear?: number,   // sim's current year — lets us age-down prospects for future classes
  eligibilityRule?: string,  // selects the era age distribution shape
): NBAPlayer[] {
  const prospects: NBAPlayer[] = [];

  // Stratified quotas only apply when generating a full-class run (≥ 30 picks).
  // Single-player calls from externalLeagueSustainer skip stratification.
  if (count < 30) {
    for (let i = 0; i < count; i++) {
      const path = samplePath(rng);
      const single = generateDraftClass(year, 1, rng, nameData, path, currentSimYear, eligibilityRule);
      if (single[0]) prospects.push(sandboxToNBAPlayer(single[0]));
    }
    return prospects;
  }

  // Fix 16: stratified sampling — pre-allocate rated talent bands.
  const yearRng = seededRng(`draft_strat_${year}`);

  // Tier 1 (generational): present ~1 in 3 years
  const hasGenerational = yearRng < 0.33;
  let filled = 0;

  for (const band of DRAFT_BANDS) {
    const bandRng = seededRng(`draft_band_${year}_${band.min}`);
    let bandCount = band.baseCount + Math.floor(bandRng * (band.extraRoll + 1));
    if (band.min >= 53) bandCount = hasGenerational ? 1 : 0;

    for (let i = 0; i < bandCount; i++) {
      const path = samplePath(rng);
      const single = generateDraftClass(year, 1, rng, nameData, path, currentSimYear, eligibilityRule, band);
      if (single[0]) {
        let prospect = sandboxToNBAPlayer(single[0]);
        // potEstimator inflates every tier-2+ pick to K2 99 because it reads the
        // already-high OVR. Override with the band's realistic ceiling instead.
        if (band.potMin !== undefined && band.potMax !== undefined) {
          const potRange = band.potMax - band.potMin;
          const potBbgm = Math.round(band.potMin + seededRng(`draft_pot_${year}_${filled}_${band.min}`) * potRange);
          prospect = { ...prospect, potential: potBbgm };
          if (prospect.ratings?.length) {
            const lastR = { ...prospect.ratings[prospect.ratings.length - 1], pot: potBbgm };
            prospect.ratings = [...prospect.ratings.slice(0, -1), lastR];
          }
        }
        prospects.push(prospect);
        filled++;
      }
    }
  }

  // Fill remaining slots as fringe (K2 < 62 = BBGM < 35, no band constraint)
  const fringeCount = count - filled;
  for (let i = 0; i < fringeCount; i++) {
    const path = samplePath(rng);
    const single = generateDraftClass(year, 1, rng, nameData, path, currentSimYear, eligibilityRule);
    if (single[0]) prospects.push(sandboxToNBAPlayer(single[0]));
  }

  return prospects;
}
