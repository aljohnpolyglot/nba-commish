import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Dices, RefreshCw, Save, Shuffle, UserPlus } from 'lucide-react';
import { useGame } from '../../../store/GameContext';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { calculateK2, K2_CATS } from '../../../services/simulation/convert2kAttributes';
import { convertTo2KRating, getCountryFromLoc } from '../../../utils/helpers';
import { ARCHETYPE_PROFILES, generateBasketballFace } from '../../../services/genDraftPlayers';
import { COLLEGE_FREQUENCIES } from '../../../genplayersconstants';
import { getNameData } from '../../../data/nameDataFetcher';
import type { MoodTrait } from '../../../utils/mood';
import { TRAIT_EXCLUSIONS } from '../../../utils/mood';
import {
  PlayerCreatorForm,
  CreatorRatingKey,
  CREATOR_RATING_KEYS,
  archetypeToRatings,
  applyBuildAdjustments,
  buildCreatedPlayer,
  calculateCreatorOverall,
  clampRating,
  defaultWingspanForHeight,
  expectedWeightForHeight,
  formatInches,
  getArchetypeMatches,
  heightToRating,
} from '../../../services/playerCreator';
import { detectPositionFromRatings, positionBucket } from '../../../utils/positionUtils';

type CreatorPhase = 'identity' | 'build' | 'ratings' | 'contract' | 'position' | 'review';

const PHASES: Array<{ id: CreatorPhase; label: string }> = [
  { id: 'identity', label: 'Identity' },
  { id: 'build', label: 'Build' },
  { id: 'ratings', label: 'K2 Ratings' },
  { id: 'contract', label: 'Contract' },
  { id: 'position', label: 'Position' },
  { id: 'review', label: 'Review' },
];

const RATING_LABELS: Record<CreatorRatingKey, string> = {
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

const COMMON_COUNTRIES = [
  'USA', 'Canada', 'France', 'Spain', 'Germany', 'Serbia', 'Greece', 'Lithuania',
  'Slovenia', 'Australia', 'Japan', 'China', 'Philippines', 'Nigeria', 'Brazil',
  'Argentina', 'Turkey', 'Italy', 'United Kingdom',
];

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'GF', 'FC'];

const ARCHETYPES_BY_POSITION: Record<string, string[]> = {
  PG: ['Primary Creator', 'Scoring Guard', 'Defensive Pest', 'Pass-First Floor Gen', 'Two-Way PG', 'Jumbo Playmaker', 'Explosive Slasher', 'Limitless Sniper'],
  SG: ['Shooting Specialist', 'Volume Scorer', 'Mid-Range Maestro', 'Slasher', '3&D Wing', 'Combo Scorer', 'Defensive Stopper', 'Non-Scoring Lockdown', 'Movement Shooter'],
  SF: ['All-Around Wing', 'Mid-Range Maestro', 'Isolation Specialist', 'Volume Scorer', '3&D Forward', 'Athletic Finisher', 'Point Forward', 'Defensive Wing', 'Non-Scoring Lockdown', 'Swiss Army Knife'],
  PF: ['Stretch Four', 'Isolation Specialist', 'Post-Up Master', 'Power Forward', 'Two-Way Forward', 'Athletic Four', 'Face-Up Four', 'Below-Rim Banger', 'Stretch Forward', 'Elite Spacing Wing', 'Switchable Spacer', 'High-Energy Finisher'],
  C: ['Traditional Center', 'The Unicorn', 'Defensive Anchor', 'Stretch Big', 'Two-Way Big', 'Offensive Hub', 'Athletic Rim-Runner', 'Undersized Big', 'Post Specialist', 'High-Energy Finisher'],
};

const K2_DRIVERS: { catKey: string; subIdx: number; bbgmKey: CreatorRatingKey; multiplier: number; hgtLimited?: boolean }[] = [
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

function primaryPosition(pos: string): 'PG' | 'SG' | 'SF' | 'PF' | 'C' {
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
  // Only fix formatting mismatches — ZenGM names.json has 124 countries directly,
  // so never reroute a real country to a proxy here.
  const aliases: Record<string, string> = {
    'United States': 'USA',
    'U.S.A.': 'USA',
    'United-Kingdom': 'United Kingdom',
    'Czech Republic': 'Czech Republic', // ZenGM uses space, not underscore
    'Democratic Republic of the Congo': 'Congo',
    'DR Congo': 'Congo',
    'Serbia-Montenegro': 'Serbia',
    'Yugoslavia': 'Serbia',
  };
  return aliases[country] ?? country;
}

function randomNameForCountry(country: string): { firstName: string; lastName: string } {
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

function makeInitialForm(year: number): PlayerCreatorForm {
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

function ratingColor(value: number): string {
  if (value >= 90) return 'text-blue-400';
  if (value >= 80) return 'text-emerald-400';
  if (value >= 70) return 'text-amber-400';
  if (value >= 55) return 'text-orange-400';
  return 'text-rose-400';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function readAndResizeImage(file: File, onDone: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = ev => {
    const raw = ev.target?.result;
    if (typeof raw !== 'string') return;
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { onDone(raw); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      onDone(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => onDone(raw);
    img.src = raw;
  };
  reader.readAsDataURL(file);
}

const inputClass = 'w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500';
const selectClass = `${inputClass} appearance-none`;
const diceBtn = 'px-2 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 flex items-center justify-center';

const TRAIT_LABELS: Record<MoodTrait, { short: string; desc: string }> = {
  COMPETITOR:   { short: 'Competitor',   desc: 'Winning obsessed — win-delta 2×' },
  LOYAL:        { short: 'Loyal',        desc: 'Slow mood decay, always +1 commish rel' },
  MERCENARY:    { short: 'Mercenary',    desc: 'Money driven — contract component 2×' },
  DIVA:         { short: 'Diva',         desc: 'Fame & PT focused — playing time 2×' },
  VOLATILE:     { short: 'Volatile',     desc: 'Negative components 1.5×, mood swings fast' },
  AMBASSADOR:   { short: 'Ambassador',   desc: 'Drama probability halved' },
  DRAMA_MAGNET: { short: 'Drama Magnet', desc: 'Drama probability doubled' },
  FAME:         { short: 'Fame',         desc: 'Market-size bonus doubled' },
};

export const PlayerCreatorView: React.FC = () => {
  const { state, createPlayer } = useGame();
  const year = state.leagueStats?.year ?? new Date().getFullYear();
  const [phase, setPhase] = useState<CreatorPhase>('identity');
  const [form, setForm] = useState<PlayerCreatorForm>(() => makeInitialForm(year));
  const [syncWingspan, setSyncWingspan] = useState(true);
  const [createdName, setCreatedName] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const countries = useMemo(() => {
    const fromPlayers = state.players
      .map(p => getCountryFromLoc(p.born?.loc))
      .filter(c => c && c !== 'Unknown');
    return [...new Set([...COMMON_COUNTRIES, ...fromPlayers])].sort();
  }, [state.players]);

  const colleges = useMemo(() => {
    const fromPlayers = state.players
      .map(p => (p as any).college)
      .filter((college): college is string => typeof college === 'string' && college.trim().length > 0)
      .map(college => college.trim());
    return [...new Set([...fromPlayers, ...Object.keys(COLLEGE_FREQUENCIES)])].sort();
  }, [state.players]);

  const availableDraftYears = useMemo(() => {
    const floor = state.draftComplete ? year + 1 : year;
    const years = new Set<number>([floor]);
    for (const p of state.players) {
      if (p.tid !== -2) continue;
      const dy = (p as any).draft?.year;
      if (typeof dy === 'number' && dy >= floor) years.add(dy);
    }
    for (let i = 1; i <= 4; i++) years.add(floor + i);
    return [...years].sort((a, b) => a - b);
  }, [state.players, state.draftComplete, year]);

  const effectiveRatings = useMemo(
    () => applyBuildAdjustments(form.ratings, form.heightIn, form.wingspanIn, form.weightLbs),
    [form.ratings, form.heightIn, form.wingspanIn, form.weightLbs],
  );
  const bbgmOvr = useMemo(() => calculateCreatorOverall(effectiveRatings), [effectiveRatings]);
  const displayOvr = convertTo2KRating(bbgmOvr, effectiveRatings.hgt, effectiveRatings.tp);
  const displayPot = convertTo2KRating(Math.max(bbgmOvr, form.potential), effectiveRatings.hgt, effectiveRatings.tp);
  const k2 = useMemo(() => calculateK2(effectiveRatings as any, {
    pos: form.pos,
    heightIn: form.heightIn,
    weightLbs: form.weightLbs,
    age: form.age,
  }), [effectiveRatings, form.pos, form.heightIn, form.weightLbs, form.age]);
  const detectedPos = useMemo(
    () => detectPositionFromRatings(effectiveRatings),
    [effectiveRatings],
  );
  const archetypeMatches = useMemo(() => {
    const bucket = positionBucket(detectedPos);
    const validArchetypes = new Set(ARCHETYPES_BY_POSITION[bucket] ?? []);
    const all = getArchetypeMatches(effectiveRatings, 20);
    const filtered = all.filter(m => validArchetypes.has(m.name)).slice(0, 4);
    return filtered.length ? filtered : all.slice(0, 4);
  }, [effectiveRatings, detectedPos]);
  const topMatch = archetypeMatches[0]?.name ?? form.archetype;

  // Keep form.pos in sync with the regression — user can override in Phase 5.
  useEffect(() => {
    setForm(prev => ({ ...prev, pos: detectedPos }));
  }, [detectedPos]);

  const teamName = useMemo(() => {
    if (form.assignment === 'freeAgent') return 'Free Agent';
    if (form.assignment === 'draftProspect') return 'Draft Prospect';
    if (form.assignment === 'retired') return 'Retired';
    const nba = state.teams.find(t => t.id === form.tid);
    const ext = (state.nonNBATeams ?? []).find((t: any) => t.tid === form.tid);
    return nba?.name ?? (ext ? `${ext.region ? `${ext.region} ` : ''}${ext.name}` : 'Unassigned');
  }, [form.assignment, form.tid, state.teams, state.nonNBATeams]);

  const set = <K extends keyof PlayerCreatorForm>(key: K, value: PlayerCreatorForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleTrait = (trait: MoodTrait) => {
    setForm(prev => {
      const current = prev.moodTraits as MoodTrait[];
      if (current.includes(trait)) {
        return { ...prev, moodTraits: current.filter(t => t !== trait) };
      }
      const excluded = TRAIT_EXCLUSIONS
        .filter(([a, b]) => a === trait || b === trait)
        .map(([a, b]) => (a === trait ? b : a));
      return { ...prev, moodTraits: [...current.filter(t => !excluded.includes(t)), trait] };
    });
  };

  const randomizePlayer = () => {
    const country = form.country || countries[Math.floor(Math.random() * countries.length)] || 'USA';
    const name = randomNameForCountry(country);
    const college = colleges.length > 0 ? colleges[Math.floor(Math.random() * colleges.length)] : form.college;
    const pos = POSITIONS[Math.floor(Math.random() * 5)];
    const primary = primaryPosition(pos);
    const archetype = ARCHETYPES_BY_POSITION[primary][Math.floor(Math.random() * ARCHETYPES_BY_POSITION[primary].length)];
    const heightByPos: Record<string, [number, number]> = {
      PG: [72, 78], SG: [75, 80], SF: [78, 83], PF: [80, 85], C: [82, 90],
    };
    const [minH, maxH] = heightByPos[primary];
    const heightIn = minH + Math.floor(Math.random() * (maxH - minH + 1));
    const base = archetypeToRatings(archetype, heightIn);
    const ratings = { ...base };
    for (const key of CREATOR_RATING_KEYS) {
      if (key === 'hgt') continue;
      ratings[key] = clampRating(base[key] + (Math.random() * 14 - 7));
    }
    const ovr = calculateCreatorOverall(ratings);
    const race = form.race || 'black';
    const gender = form.gender || 'male';
    setForm(prev => ({
      ...prev,
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
    }));
  };

  const randomizeFirstName = () => {
    const { firstName } = randomNameForCountry(form.country || 'USA');
    set('firstName', firstName);
  };

  const randomizeLastName = () => {
    const { lastName } = randomNameForCountry(form.country || 'USA');
    set('lastName', lastName);
  };

  const randomizeCountry = () => {
    const country = countries[Math.floor(Math.random() * countries.length)] || 'USA';
    setForm(prev => ({ ...prev, country }));
  };

  const randomizeCollege = () => {
    const college = colleges[Math.floor(Math.random() * colleges.length)];
    if (college) set('college', college);
  };

  const randomizeJerseyNumber = () => {
    set('jerseyNumber', String(Math.floor(Math.random() * 99)));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readAndResizeImage(file, dataUrl => set('imgURL', dataUrl));
    e.target.value = '';
  };

  const handleHeightChange = (height: number) => {
    const h = Math.max(60, Math.min(91, height));
    setForm(prev => {
      // Preserve the player's mass bias (heavy/light delta) at the new height so
      // dragging height alone doesn't spuriously shift speed/strength ratings.
      const oldDelta = prev.weightLbs - expectedWeightForHeight(prev.heightIn);
      const newWeight = Math.max(140, Math.min(340, Math.round(expectedWeightForHeight(h) + oldDelta)));
      return {
        ...prev,
        heightIn: h,
        weightLbs: newWeight,
        wingspanIn: syncWingspan ? defaultWingspanForHeight(h) : prev.wingspanIn,
        ratings: { ...prev.ratings, hgt: heightToRating(h) },
      };
    });
  };

  const handleK2SliderChange = (catKey: string, subIdx: number, newK2Val: number) => {
    const driver = K2_DRIVERS.find(d => d.catKey === catKey && d.subIdx === subIdx);
    if (!driver) return;
    const currentK2 = (k2 as any)[catKey].sub[subIdx] as number;
    const delta2k = newK2Val - currentK2;
    if (delta2k === 0) return;
    const deltaRating = delta2k / driver.multiplier;
    setForm(prev => ({
      ...prev,
      ratings: {
        ...prev.ratings,
        [driver.bbgmKey]: clampRating((prev.ratings[driver.bbgmKey] ?? 50) + deltaRating),
      },
    }));
  };

  const handleAssignmentChange = (assignment: PlayerCreatorForm['assignment']) => {
    setForm(prev => {
      if (assignment === 'freeAgent') return { ...prev, assignment, tid: -1 };
      if (assignment === 'draftProspect') return { ...prev, assignment, tid: -2, draftYear: Math.max(prev.draftYear, year) };
      if (assignment === 'retired') return { ...prev, assignment, tid: -3, retiredYear: prev.retiredYear ?? year };
      if (assignment === 'external') {
        const firstExternal = (state.nonNBATeams ?? [])[0] as any;
        return { ...prev, assignment, tid: firstExternal?.tid ?? prev.tid, externalStatus: firstExternal?.league };
      }
      return { ...prev, assignment, tid: state.teams[0]?.id ?? 0 };
    });
  };

  const handleCreate = () => {
    const player = buildCreatedPlayer(
      { ...form, archetype: topMatch },
      {
        season: year,
        date: state.date,
        teams: state.teams,
        nonNBATeams: state.nonNBATeams ?? [],
        existingPlayers: state.players,
      },
    );
    createPlayer(player);
    setCreatedName(player.name);
    setForm(makeInitialForm(year));
    setPhase('identity');
  };

  const phaseIndex = PHASES.findIndex(p => p.id === phase);
  const wingspanDelta = form.wingspanIn - form.heightIn;
  const heightWarn = form.heightIn < 68 || form.heightIn > 90;

  return (
    <div className="h-full overflow-y-auto bg-[#111827] text-slate-200 custom-scrollbar">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-400">Commissioner Tool</p>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">Player Creator</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setForm(makeInitialForm(year))} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <RefreshCw size={14} /> Reset
            </button>
            <button onClick={randomizePlayer} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Shuffle size={14} /> Randomize
            </button>
            <button onClick={handleCreate} className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Save size={14} /> Create Player
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {PHASES.map((p, idx) => (
            <button
              key={p.id}
              onClick={() => setPhase(p.id)}
              className={`rounded-2xl border px-3 py-3 text-left transition-all ${phase === p.id ? 'bg-sky-500/20 border-sky-400 text-white' : idx < phaseIndex ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'}`}
            >
              <p className="text-[9px] font-black uppercase tracking-widest">Phase {idx + 1}</p>
              <p className="text-sm font-black">{p.label}</p>
            </button>
          ))}
        </div>

        {createdName && (
          <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-2xl px-4 py-3 text-sm font-bold text-emerald-300">
            Created {createdName} and added to the league.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-5">
          <div className="space-y-5">

            {/* ── IDENTITY ── */}
            {phase === 'identity' && (
              <>
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Identity</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="First Name">
                      <div className="flex gap-1.5">
                        <input className={`${inputClass} flex-1`} value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                        <button type="button" onClick={randomizeFirstName} className={diceBtn} title="Random first name"><Dices size={13} /></button>
                      </div>
                    </Field>
                    <Field label="Last Name">
                      <div className="flex gap-1.5">
                        <input className={`${inputClass} flex-1`} value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                        <button type="button" onClick={randomizeLastName} className={diceBtn} title="Random last name"><Dices size={13} /></button>
                      </div>
                    </Field>
                    <Field label="Age">
                      <input className={inputClass} type="number" min={15} max={55} value={form.age} onChange={e => set('age', Number(e.target.value))} />
                    </Field>
                    <Field label="Hand">
                      <select className={selectClass} value={form.handedness} onChange={e => set('handedness', e.target.value as any)}>
                        <option>Right</option>
                        <option>Left</option>
                      </select>
                    </Field>
                    <Field label="Country">
                      <div className="flex gap-1.5">
                        <select className={`${selectClass} flex-1`} value={form.country} onChange={e => {
                          const country = e.target.value;
                          const name = randomNameForCountry(country);
                          setForm(prev => ({ ...prev, country, ...name }));
                        }}>
                          {countries.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button type="button" onClick={randomizeCountry} className={diceBtn} title="Random country"><Dices size={13} /></button>
                      </div>
                    </Field>
                    <Field label="College / Club">
                      <div className="flex gap-1.5">
                        <select className={`${selectClass} flex-1`} value={form.college} onChange={e => set('college', e.target.value)}>
                          {!colleges.includes(form.college) && <option value={form.college}>{form.college}</option>}
                          {colleges.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button type="button" onClick={randomizeCollege} className={diceBtn} title="Random college"><Dices size={13} /></button>
                      </div>
                    </Field>
                    <Field label="Jersey #">
                      <div className="flex gap-1.5">
                        <input className={`${inputClass} flex-1`} value={form.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} />
                        <button type="button" onClick={randomizeJerseyNumber} className={diceBtn} title="Random number"><Dices size={13} /></button>
                      </div>
                    </Field>
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Assignment</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Destination">
                      <select className={selectClass} value={form.assignment} onChange={e => handleAssignmentChange(e.target.value as any)}>
                        <option value="nba">NBA Team</option>
                        <option value="external">External Team</option>
                        <option value="freeAgent">Free Agent</option>
                        <option value="draftProspect">Draft Prospect</option>
                        <option value="retired">Retired</option>
                      </select>
                    </Field>
                    {form.assignment === 'nba' && (
                      <Field label="NBA Team">
                        <select className={selectClass} value={form.tid} onChange={e => set('tid', Number(e.target.value))}>
                          {state.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </Field>
                    )}
                    {form.assignment === 'external' && (
                      <Field label="External Team">
                        <select className={selectClass} value={form.tid} onChange={e => {
                          const tid = Number(e.target.value);
                          const team = (state.nonNBATeams ?? []).find((t: any) => t.tid === tid) as any;
                          setForm(prev => ({ ...prev, tid, externalStatus: team?.league }));
                        }}>
                          {(state.nonNBATeams ?? []).map((t: any) => (
                            <option key={t.tid} value={t.tid}>{t.league} - {t.region ? `${t.region} ` : ''}{t.name}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {form.assignment === 'draftProspect' && (
                      <Field label="Draft Year">
                        <select className={selectClass} value={form.draftYear} onChange={e => set('draftYear', Number(e.target.value))}>
                          {availableDraftYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </Field>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* ── BUILD ── */}
            {phase === 'build' && (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Body Build</h3>
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <input type="checkbox" checked={syncWingspan} onChange={e => setSyncWingspan(e.target.checked)} className="accent-sky-500" />
                    Auto-wingspan
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label={`Height ${formatInches(form.heightIn)}`}>
                    <input type="range" min={60} max={91} value={form.heightIn} onChange={e => handleHeightChange(Number(e.target.value))} className="w-full accent-sky-500" />
                  </Field>
                  <Field label={`Wingspan ${formatInches(form.wingspanIn)} (${wingspanDelta >= 0 ? '+' : ''}${wingspanDelta})`}>
                    <input type="range" min={Math.max(56, form.heightIn - 4)} max={Math.min(103, form.heightIn + 12)} value={form.wingspanIn} onChange={e => set('wingspanIn', Number(e.target.value))} className="w-full accent-cyan-500" />
                  </Field>
                  <Field label={`Weight ${form.weightLbs} lbs`}>
                    <input type="range" min={140} max={340} value={form.weightLbs} onChange={e => set('weightLbs', Number(e.target.value))} className="w-full accent-amber-500" />
                  </Field>
                </div>
                {heightWarn && <p className="text-xs text-amber-400 font-bold">Extreme heights may rate unusually.</p>}
              </section>
            )}

            {/* ── RATINGS ── */}
            {phase === 'ratings' && (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">K2 Ratings Editor</h3>
                  <p className="text-xs text-slate-500">K2 sliders edit the underlying BBGM attributes using the same driver logic as the player ratings modal.</p>
                </div>
                <div className="space-y-5">
                  {K2_CATS.map(cat => {
                    const catData = (k2 as any)[cat.k];
                    return (
                      <div key={cat.k} className="rounded-2xl bg-slate-950/50 border border-slate-800 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black text-white uppercase tracking-widest">{cat.n}</span>
                          <span className={`text-sm font-black ${ratingColor(catData.ovr)}`}>{catData.ovr}</span>
                        </div>
                        <div className="space-y-2">
                          {cat.sub.map((sub, idx) => {
                            const driver = K2_DRIVERS.find(d => d.catKey === cat.k && d.subIdx === idx);
                            const val = catData.sub[idx] ?? 50;
                            return (
                              <div key={sub} className="grid grid-cols-[8rem_1fr_2.5rem_4.5rem] gap-2 items-center">
                                <span className="text-[10px] font-bold text-slate-300 truncate">{sub}</span>
                                <input
                                  type="range" min={25} max={99} value={val} disabled={!driver}
                                  onChange={e => handleK2SliderChange(cat.k, idx, Number(e.target.value))}
                                  className="w-full accent-sky-500 disabled:opacity-30"
                                />
                                <span className={`text-[10px] font-black text-right ${ratingColor(val)}`}>{val}</span>
                                <span className={`text-[8px] font-bold text-right ${driver?.hgtLimited ? 'text-amber-500' : 'text-slate-600'}`}>
                                  {driver ? RATING_LABELS[driver.bbgmKey] : 'locked'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── CONTRACT ── */}
            {phase === 'contract' && (
              <>
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Contract And Draft</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Salary $M"><input className={inputClass} type="number" min={0} step={0.1} value={form.contractAmountM} onChange={e => set('contractAmountM', Number(e.target.value))} /></Field>
                    <Field label="Contract Exp"><input className={inputClass} type="number" value={form.contractExp} onChange={e => set('contractExp', Number(e.target.value))} /></Field>
                    <Field label="Draft Year"><input className={inputClass} type="number" value={form.draftYear} onChange={e => set('draftYear', Number(e.target.value))} /></Field>
                    <Field label="Round"><input className={inputClass} type="number" min={0} max={2} value={form.draftRound} onChange={e => set('draftRound', Number(e.target.value))} /></Field>
                    <Field label="Pick"><input className={inputClass} type="number" min={0} max={60} value={form.draftPick} onChange={e => set('draftPick', Number(e.target.value))} /></Field>
                    <Field label="Draft Team">
                      <select className={selectClass} value={form.draftTid} onChange={e => set('draftTid', Number(e.target.value))}>
                        <option value={-1}>Undrafted</option>
                        {state.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                  </div>
                </section>
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Appearance And Traits</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Race">
                      <select className={selectClass} value={form.race} onChange={e => set('race', e.target.value)}>
                        {['black', 'white', 'brown', 'asian'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </Field>
                    <Field label="Gender">
                      <select className={selectClass} value={form.gender} onChange={e => set('gender', e.target.value as any)}>
                        <option value="male">male</option>
                        <option value="female">female</option>
                      </select>
                    </Field>
                    <Field label="Face">
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, face: generateBasketballFace({ race: prev.race, gender: prev.gender }), imgURL: '' }))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        <Shuffle size={13} /> Randomize Face
                      </button>
                    </Field>
                    {form.imgURL && (
                      <Field label="Photo">
                        <button type="button" onClick={() => set('imgURL', '')} className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase tracking-widest">
                          Remove Upload
                        </button>
                      </Field>
                    )}
                  </div>
                  <div className="col-span-2 space-y-2 pt-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Personality Traits</span>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(TRAIT_LABELS) as MoodTrait[]).map(trait => {
                        const active = (form.moodTraits as MoodTrait[]).includes(trait);
                        const blocked = !active && TRAIT_EXCLUSIONS.some(([a, b]) =>
                          (a === trait && (form.moodTraits as MoodTrait[]).includes(b)) ||
                          (b === trait && (form.moodTraits as MoodTrait[]).includes(a)),
                        );
                        return (
                          <button
                            type="button"
                            key={trait}
                            onClick={() => toggleTrait(trait)}
                            disabled={blocked}
                            title={TRAIT_LABELS[trait].desc}
                            className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                              active
                                ? 'bg-sky-500/20 border-sky-400/60 text-sky-300'
                                : blocked
                                ? 'bg-slate-900/30 border-slate-800 text-slate-700 cursor-not-allowed'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                            }`}
                          >
                            {TRAIT_LABELS[trait].short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <input type="checkbox" checked={form.hof} onChange={e => set('hof', e.target.checked)} className="accent-amber-500" /> Hall of Fame
                  </label>
                </section>
              </>
            )}

            {/* ── POSITION ── */}
            {phase === 'position' && (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Position</h3>
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">Auto-Detected From Ratings</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-black text-white">{topMatch}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-sky-300 font-black text-lg">{detectedPos}</span>
                    <button
                      type="button"
                      onClick={() => set('pos', detectedPos)}
                      className="px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-black uppercase tracking-widest"
                    >
                      Use This
                    </button>
                  </div>
                </div>
                <Field label="Override Position">
                  <select className={selectClass} value={form.pos} onChange={e => set('pos', e.target.value)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </section>
            )}

            {/* ── REVIEW ── */}
            {phase === 'review' && (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Review</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Name</p><p className="text-sm font-black text-white">{form.firstName} {form.lastName}</p></div>
                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Team</p><p className="text-sm font-black text-white">{teamName}</p></div>
                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Build</p><p className="text-sm font-black text-white">{form.pos} · {formatInches(form.heightIn)}</p></div>
                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3"><p className="text-[9px] text-slate-500 uppercase font-black">Auto Type</p><p className="text-sm font-black text-white">{topMatch}</p></div>
                </div>
                <button type="button" onClick={handleCreate} className="w-full px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <UserPlus size={15} /> Create Player
                </button>
              </section>
            )}

            {/* ── NAV ── */}
            <div className="flex items-center justify-between">
              <button
                disabled={phaseIndex <= 0}
                onClick={() => setPhase(PHASES[Math.max(0, phaseIndex - 1)].id)}
                className="px-4 py-2 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-black uppercase tracking-widest"
              >
                Back
              </button>
              <button
                disabled={phaseIndex >= PHASES.length - 1}
                onClick={() => setPhase(PHASES[Math.min(PHASES.length - 1, phaseIndex + 1)].id)}
                className="px-4 py-2 rounded-xl bg-sky-500 disabled:opacity-40 text-slate-950 text-xs font-black uppercase tracking-widest"
              >
                Next Phase
              </button>
            </div>
          </div>

          {/* ── PLAYER CARD ── */}
          <div className="space-y-5">
            <section className="rounded-[2rem] border border-sky-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-sky-950/40 p-5 sticky top-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="group relative rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky-500"
                  title="Upload photo"
                >
                  <PlayerPortrait imgUrl={form.imgURL} face={form.imgURL ? undefined : form.face} playerName={`${form.firstName} ${form.lastName}`} size={84} />
                  <span className="absolute inset-0 flex items-center justify-center bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={22} className="text-white" />
                  </span>
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" capture="user" onChange={handlePhotoUpload} className="hidden" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight truncate">{form.firstName} {form.lastName}</h3>
                  <p className="text-sm text-slate-400">{form.pos} · {formatInches(form.heightIn)} · {form.weightLbs} lbs</p>
                  <p className="text-xs text-sky-300 font-bold">{topMatch} · {teamName}</p>
                </div>
                <div className="text-center rounded-3xl border border-sky-400/40 bg-sky-400/10 px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">OVR</p>
                  <p className="text-4xl font-black text-sky-300">{displayOvr}</p>
                  <p className="text-[10px] text-slate-500">POT {displayPot}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {archetypeMatches.map(match => (
                  <div key={match.name} className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                    <div className="flex justify-between gap-2">
                      <span className="text-xs font-black text-white truncate">{match.name}</span>
                      <span className="text-xs font-black text-sky-300">{match.score}%</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${match.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                {K2_CATS.map(cat => {
                  const catData = (k2 as any)[cat.k];
                  return (
                    <div key={cat.k} className="rounded-2xl bg-slate-950/50 border border-slate-800 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-white uppercase">{cat.n}</span>
                        <span className={`text-sm font-black ${ratingColor(catData.ovr)}`}>{catData.ovr}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {cat.sub.map((sub, idx) => (
                          <div key={sub} className="flex justify-between text-[10px] gap-2">
                            <span className="text-slate-500 truncate">{sub}</span>
                            <span className={`font-black ${ratingColor(catData.sub[idx] ?? 50)}`}>{catData.sub[idx] ?? 50}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
