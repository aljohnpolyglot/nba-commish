import React from 'react';
import { generateBasketballFace, ARCHETYPE_PROFILES } from '../../../services/genDraftPlayers';
import { getNameData } from '../../../data/nameDataFetcher';
import { calculateCreatorOverall, archetypeToRatings, clampRating, defaultWingspanForHeight, expectedWeightForHeight, heightToRating, type CreatorRatingKey, type PlayerCreatorForm } from '../../../services/playerCreator';
import type { MoodTrait } from '../../../utils/mood';

export type CreatorPhase = 'identity' | 'build' | 'ratings' | 'contract' | 'position' | 'review';

export type SetCreatorField = <K extends keyof PlayerCreatorForm>(key: K, value: PlayerCreatorForm[K]) => void;

export const PHASES: Array<{ id: CreatorPhase; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'build', label: 'Build' },
  { id: 'ratings', label: 'K2 Ratings' },
  { id: 'contract', label: 'Contract' },
  { id: 'position', label: 'Position' },
  { id: 'review', label: 'Review' },
];

export const RATING_LABELS: Record<CreatorRatingKey, string> = {
  hgt: 'Height',
  stre: 'Strength',
  spd: 'Speed',
  jmp: 'Vertical',
  endu: 'Stamina',
  ins: 'Inside',
  dnk: 'Dunk',
  ft: 'Free Throw',
  fg: 'Mid-Range',
  tp: 'Three',
  oiq: 'Off IQ',
  diq: 'Def IQ',
  drb: 'Handle',
  pss: 'Passing',
  reb: 'Rebound',
};

export const COMMON_COUNTRIES = [
  'USA', 'Canada', 'France', 'Spain', 'Germany', 'Serbia', 'Greece', 'Lithuania',
  'Slovenia', 'Australia', 'Japan', 'China', 'Philippines', 'Nigeria', 'Brazil',
  'Argentina', 'Turkey', 'Italy', 'United Kingdom',
];

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'GF', 'FC'];

export const ARCHETYPES_BY_POSITION: Record<string, string[]> = {
  PG: ['Primary Creator', 'Scoring Guard', 'Defensive Pest', 'Pass-First Floor Gen', 'Two-Way PG', 'Jumbo Playmaker', 'Explosive Slasher', 'Limitless Sniper'],
  SG: ['Shooting Specialist', 'Volume Scorer', 'Mid-Range Maestro', 'Slasher', '3&D Wing', 'Combo Scorer', 'Defensive Stopper', 'Non-Scoring Lockdown', 'Movement Shooter'],
  SF: ['All-Around Wing', 'Mid-Range Maestro', 'Isolation Specialist', 'Volume Scorer', '3&D Forward', 'Athletic Finisher', 'Point Forward', 'Defensive Wing', 'Non-Scoring Lockdown', 'Swiss Army Knife'],
  PF: ['Stretch Four', 'Isolation Specialist', 'Post-Up Master', 'Power Forward', 'Two-Way Forward', 'Athletic Four', 'Face-Up Four', 'Below-Rim Banger', 'Stretch Forward', 'Elite Spacing Wing', 'Switchable Spacer', 'High-Energy Finisher'],
  C: ['Traditional Center', 'The Unicorn', 'Defensive Anchor', 'Stretch Big', 'Two-Way Big', 'Offensive Hub', 'Athletic Rim-Runner', 'Undersized Big', 'Post Specialist', 'High-Energy Finisher'],
};

export const K2_DRIVERS: { catKey: string; subIdx: number; bbgmKey: CreatorRatingKey; multiplier: number; hgtLimited?: boolean }[] = [
  { catKey: 'OS', subIdx: 0, bbgmKey: 'ins', multiplier: 0.30 },
  { catKey: 'OS', subIdx: 1, bbgmKey: 'fg', multiplier: 0.48 },
  { catKey: 'OS', subIdx: 2, bbgmKey: 'tp', multiplier: 0.48 },
  { catKey: 'OS', subIdx: 3, bbgmKey: 'ft', multiplier: 0.60 },
  { catKey: 'OS', subIdx: 4, bbgmKey: 'oiq', multiplier: 0.60 },
  { catKey: 'OS', subIdx: 5, bbgmKey: 'oiq', multiplier: 0.24 },
  { catKey: 'AT', subIdx: 0, bbgmKey: 'spd', multiplier: 0.60 },
  { catKey: 'AT', subIdx: 1, bbgmKey: 'spd', multiplier: 0.42 },
  { catKey: 'AT', subIdx: 2, bbgmKey: 'stre', multiplier: 0.48 },
  { catKey: 'AT', subIdx: 3, bbgmKey: 'jmp', multiplier: 0.60 },
  { catKey: 'AT', subIdx: 4, bbgmKey: 'endu', multiplier: 0.60 },
  { catKey: 'AT', subIdx: 5, bbgmKey: 'endu', multiplier: 0.36 },
  { catKey: 'AT', subIdx: 6, bbgmKey: 'endu', multiplier: 0.60 },
  { catKey: 'IS', subIdx: 0, bbgmKey: 'ins', multiplier: 0.48 },
  { catKey: 'IS', subIdx: 1, bbgmKey: 'dnk', multiplier: 0.24, hgtLimited: true },
  { catKey: 'IS', subIdx: 2, bbgmKey: 'dnk', multiplier: 0.54 },
  { catKey: 'IS', subIdx: 3, bbgmKey: 'ins', multiplier: 0.48 },
  { catKey: 'IS', subIdx: 4, bbgmKey: 'fg', multiplier: 0.36 },
  { catKey: 'IS', subIdx: 5, bbgmKey: 'stre', multiplier: 0.36 },
  { catKey: 'IS', subIdx: 6, bbgmKey: 'ins', multiplier: 0.18 },
  { catKey: 'IS', subIdx: 7, bbgmKey: 'oiq', multiplier: 0.42 },
  { catKey: 'PL', subIdx: 0, bbgmKey: 'pss', multiplier: 0.60 },
  { catKey: 'PL', subIdx: 1, bbgmKey: 'drb', multiplier: 0.60 },
  { catKey: 'PL', subIdx: 2, bbgmKey: 'drb', multiplier: 0.36 },
  { catKey: 'PL', subIdx: 3, bbgmKey: 'pss', multiplier: 0.30 },
  { catKey: 'PL', subIdx: 4, bbgmKey: 'oiq', multiplier: 0.42 },
  { catKey: 'DF', subIdx: 0, bbgmKey: 'diq', multiplier: 0.135, hgtLimited: true },
  { catKey: 'DF', subIdx: 1, bbgmKey: 'diq', multiplier: 0.72 },
  { catKey: 'DF', subIdx: 2, bbgmKey: 'diq', multiplier: 0.54 },
  { catKey: 'DF', subIdx: 3, bbgmKey: 'jmp', multiplier: 0.24, hgtLimited: true },
  { catKey: 'DF', subIdx: 4, bbgmKey: 'diq', multiplier: 0.90 },
  { catKey: 'DF', subIdx: 5, bbgmKey: 'diq', multiplier: 0.54 },
  { catKey: 'DF', subIdx: 6, bbgmKey: 'diq', multiplier: 0.36, hgtLimited: true },
  { catKey: 'RB', subIdx: 0, bbgmKey: 'reb', multiplier: 0.18, hgtLimited: true },
  { catKey: 'RB', subIdx: 1, bbgmKey: 'reb', multiplier: 0.18, hgtLimited: true },
];

export const inputClass = 'w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500';
export const selectClass = `${inputClass} appearance-none`;
export const diceBtn = 'px-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 flex items-center justify-center';

export const TRAIT_LABELS: Record<MoodTrait, { short: string; desc: string }> = {
  COMPETITOR: { short: 'Competitor', desc: 'Winning obsessed — win-delta 2×' },
  LOYAL: { short: 'Loyal', desc: 'Slow mood decay, always +1 commish rel' },
  MERCENARY: { short: 'Mercenary', desc: 'Money driven — contract component 2×' },
  DIVA: { short: 'Diva', desc: 'Fame & PT focused — playing time 2×' },
  VOLATILE: { short: 'Volatile', desc: 'Negative components 1.5×, mood swings fast' },
  AMBASSADOR: { short: 'Ambassador', desc: 'Drama probability halved' },
  DRAMA_MAGNET: { short: 'Drama Magnet', desc: 'Drama probability doubled' },
  FAME: { short: 'Fame', desc: 'Market-size bonus doubled' },
};

export function primaryPosition(pos: string): 'PG' | 'SG' | 'SF' | 'PF' | 'C' {
  if (pos.includes('PG')) return 'PG';
  if (pos.includes('SG') || pos === 'G') return 'SG';
  if (pos.includes('SF') || pos === 'GF' || pos === 'F') return 'SF';
  if (pos.includes('PF')) return 'PF';
  return 'C';
}

function weightedPick(obj: Record<string, number> | undefined, fallback: string): string {
  if (!obj || Object.keys(obj).length === 0) return fallback;
  const total = Object.values(obj).reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (total <= 0) return Object.keys(obj)[0] ?? fallback;
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(obj)) {
    roll -= Number(weight) || 0;
    if (roll <= 0) return key;
  }
  return Object.keys(obj)[0] ?? fallback;
}

function normalizeNameCountry(country: string): string {
  const aliases: Record<string, string> = {
    'United States': 'USA',
    'U.S.A.': 'USA',
    'United-Kingdom': 'United Kingdom',
    'Czech Republic': 'Czech Republic',
    'Democratic Republic of the Congo': 'Congo',
    'DR Congo': 'Congo',
    'Serbia-Montenegro': 'Serbia',
    Yugoslavia: 'Serbia',
  };
  return aliases[country] ?? country;
}

export function randomNameForCountry(country: string): { firstName: string; lastName: string } {
  const nameData = getNameData();
  const normalized = normalizeNameCountry(country);
  const pool =
    nameData.countries[normalized]
    ?? nameData.countries[normalized.replace(/ /g, '_')]
    ?? nameData.countries.USA
    ?? Object.values(nameData.countries)[0];
  return {
    firstName: weightedPick(pool?.first, 'Created'),
    lastName: weightedPick(pool?.last, 'Player'),
  };
}

export function makeInitialForm(year: number): PlayerCreatorForm {
  const archetype = 'All-Around Wing';
  const heightIn = 79;
  const ratings = archetypeToRatings(archetype, heightIn);
  const ovr = calculateCreatorOverall(ratings);
  return {
    firstName: 'Created',
    lastName: 'Player',
    age: 20,
    country: 'USA',
    college: 'Custom Academy',
    pos: 'SF',
    jerseyNumber: '',
    assignment: 'freeAgent',
    tid: -1,
    heightIn,
    weightLbs: 210,
    wingspanIn: defaultWingspanForHeight(heightIn),
    handedness: 'Right',
    race: 'black',
    gender: 'male',
    face: generateBasketballFace({ race: 'black', gender: 'male' }),
    ratings,
    potential: Math.min(99, ovr + 8),
    drivingDunk: 65,
    standingDunk: 30,
    durability: 75,
    composure: 65,
    clutch: 65,
    workEthic: 70,
    archetype,
    contractAmountM: 1.4,
    contractExp: year + 1,
    draftYear: year,
    draftRound: 0,
    draftPick: 0,
    draftTid: -1,
    hof: false,
    injuryType: '',
    injuryGames: 0,
    moodTraits: ['COMPETITOR'],
    ratingsLocked: false,
  };
}

export function ratingColor(value: number): string {
  if (value >= 90) return 'text-blue-400';
  if (value >= 80) return 'text-emerald-400';
  if (value >= 70) return 'text-amber-400';
  if (value >= 55) return 'text-orange-400';
  return 'text-rose-400';
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

export function readAndResizeImage(file: File, onDone: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = event => {
    const raw = event.target?.result;
    if (typeof raw !== 'string') return;
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onDone(raw);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      onDone(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => onDone(raw);
    img.src = raw;
  };
  reader.readAsDataURL(file);
}

export function randomizeFormPlayer(
  form: PlayerCreatorForm,
  countries: string[],
  colleges: string[],
): PlayerCreatorForm {
  const country = form.country || countries[Math.floor(Math.random() * countries.length)] || 'USA';
  const name = randomNameForCountry(country);
  const college = colleges.length > 0 ? colleges[Math.floor(Math.random() * colleges.length)] : form.college;
  const pos = POSITIONS[Math.floor(Math.random() * 5)];
  const primary = primaryPosition(pos);
  const archetype = ARCHETYPES_BY_POSITION[primary][Math.floor(Math.random() * ARCHETYPES_BY_POSITION[primary].length)];
  const heightByPos: Record<string, [number, number]> = {
    PG: [72, 78],
    SG: [75, 80],
    SF: [78, 83],
    PF: [80, 85],
    C: [82, 90],
  };
  const [minH, maxH] = heightByPos[primary];
  const heightIn = minH + Math.floor(Math.random() * (maxH - minH + 1));
  const base = archetypeToRatings(archetype, heightIn);
  const ratings = { ...base };
  for (const key of Object.keys(ratings) as CreatorRatingKey[]) {
    if (key === 'hgt') continue;
    ratings[key] = clampRating(base[key] + (Math.random() * 14 - 7));
  }
  const ovr = calculateCreatorOverall(ratings);
  const race = form.race || 'black';
  const gender = form.gender || 'male';

  return {
    ...form,
    firstName: name.firstName,
    lastName: name.lastName,
    country,
    college,
    pos,
    archetype,
    age: 18 + Math.floor(Math.random() * 18),
    heightIn,
    weightLbs: Math.max(140, Math.min(340, Math.round(expectedWeightForHeight(heightIn) + (Math.random() * 58 - 20)))),
    wingspanIn: defaultWingspanForHeight(heightIn) + Math.floor(Math.random() * 3),
    jerseyNumber: String(Math.floor(Math.random() * 99)),
    ratings,
    potential: Math.min(99, ovr + 4 + Math.floor(Math.random() * 11)),
    drivingDunk: clampRating((ARCHETYPE_PROFILES[archetype]?.drivingDunk ?? 55) + (Math.random() * 10 - 5)),
    standingDunk: clampRating((ARCHETYPE_PROFILES[archetype]?.standingDunk ?? 25) + (Math.random() * 10 - 5)),
    face: generateBasketballFace({ race, gender }),
    imgURL: '',
  };
}

export function buildHeightAdjustedForm(
  prev: PlayerCreatorForm,
  height: number,
  syncWingspan: boolean,
): PlayerCreatorForm {
  const h = Math.max(60, Math.min(91, height));
  const oldDelta = prev.weightLbs - expectedWeightForHeight(prev.heightIn);
  const newWeight = Math.max(140, Math.min(340, Math.round(expectedWeightForHeight(h) + oldDelta)));
  return {
    ...prev,
    heightIn: h,
    weightLbs: newWeight,
    wingspanIn: syncWingspan ? defaultWingspanForHeight(h) : prev.wingspanIn,
    ratings: { ...prev.ratings, hgt: heightToRating(h) },
  };
}
