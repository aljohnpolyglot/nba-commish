import type { NBAPlayer } from '../types';
import { ARCHETYPE_PROFILES, generateBasketballFace, potEstimator } from './genDraftPlayers';

export type CreatorAssignment = 'nba' | 'freeAgent' | 'draftProspect' | 'retired' | 'external';

export const CREATOR_RATING_KEYS = [
  'hgt', 'stre', 'spd', 'jmp', 'endu',
  'ins', 'dnk', 'ft', 'fg', 'tp',
  'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

export type CreatorRatingKey = typeof CREATOR_RATING_KEYS[number];
export type CreatorRatings = Record<CreatorRatingKey, number>;

export interface PlayerCreatorForm {
  firstName: string;
  lastName: string;
  age: number;
  country: string;
  college: string;
  pos: string;
  jerseyNumber: string;
  assignment: CreatorAssignment;
  tid: number;
  externalStatus?: NBAPlayer['status'];
  heightIn: number;
  weightLbs: number;
  wingspanIn: number;
  handedness: 'Right' | 'Left';
  race?: string;
  gender?: 'male' | 'female';
  imgURL?: string;
  face?: any;
  ratings: CreatorRatings;
  potential: number;
  drivingDunk: number;
  standingDunk: number;
  durability: number;
  composure: number;
  clutch: number;
  workEthic: number;
  archetype: string;
  contractAmountM: number;
  contractExp: number;
  draftYear: number;
  draftRound: number;
  draftPick: number;
  draftTid: number;
  hof: boolean;
  retiredYear?: number;
  injuryType?: string;
  injuryGames?: number;
  moodTraits: string[];
  ratingsLocked: boolean;
}

export interface PlayerCreatorContext {
  season: number;
  date: string;
  teams: Array<{ id: number; name: string; abbrev?: string }>;
  nonNBATeams: Array<{ tid: number; name: string; region?: string; abbrev?: string; league?: string }>;
  existingPlayers: NBAPlayer[];
}

export function clampRating(value: number): number {
  return Math.max(0, Math.min(99, Math.round(Number.isFinite(value) ? value : 50)));
}

export function heightToRating(heightIn: number): number {
  return clampRating(((heightIn - 68) / 22) * 99);
}

export function formatInches(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  return `${ft}'${inch}"`;
}

export function defaultWingspanForHeight(heightIn: number): number {
  const bonus = heightIn >= 82 ? 5 : heightIn >= 78 ? 4 : heightIn >= 74 ? 3 : 2;
  return Math.round(heightIn + bonus);
}

export function expectedWeightForHeight(heightIn: number): number {
  const h = Math.max(60, Math.min(91, Number.isFinite(heightIn) ? heightIn : 79));
  return Math.round(Math.max(145, Math.min(310, 176 + (h - 72) * 5.8)));
}

export function applyBuildAdjustments(
  ratings: CreatorRatings,
  heightIn: number,
  wingspanIn: number,
  weightLbs: number,
): CreatorRatings {
  const apeIndex = wingspanIn - heightIn;
  const next: CreatorRatings = { ...ratings, hgt: heightToRating(heightIn) };

  // Weight is the body-build lever: heavier builds gain force, lighter builds gain movement.
  const massIndex = Math.max(-1.5, Math.min(1.5, (weightLbs - expectedWeightForHeight(heightIn)) / 28));
  const heavy = Math.max(0, massIndex);
  const light = Math.max(0, -massIndex);
  next.stre = clampRating(next.stre + massIndex * 14);
  next.reb = clampRating(next.reb + massIndex * 6);
  next.ins = clampRating(next.ins + heavy * 3);
  next.dnk = clampRating(next.dnk + massIndex * 2);
  next.spd = clampRating(next.spd - heavy * 13 + light * 11);
  next.jmp = clampRating(next.jmp - heavy * 6 + light * 5);
  next.endu = clampRating(next.endu - heavy * 5 + light * 3);
  next.drb = clampRating(next.drb - heavy * 3 + light * 2);

  // Height naturally limits movement: taller players are slower/less agile regardless of weight.
  // Baseline is 78" (6'6"). Each inch above/below shifts movement attributes.
  const heightBias = (heightIn - 78) / 10;
  next.spd  = clampRating(next.spd  - heightBias * 14);
  next.drb  = clampRating(next.drb  - heightBias * 8);
  next.endu = clampRating(next.endu - heightBias * 6);
  next.jmp  = clampRating(next.jmp  - heightBias * 5);

  // Wingspan is a build lever: long arms help defense/finishing, short arms help skill/shooting.
  const longArm = Math.max(0, Math.min(12, apeIndex));
  const shortArm = Math.max(0, Math.min(4, -apeIndex));
  next.reb = clampRating(next.reb + longArm * 0.9 - shortArm * 0.6);
  next.diq = clampRating(next.diq + longArm * 0.65 - shortArm * 0.4);
  next.dnk = clampRating(next.dnk + longArm * 0.45 - shortArm * 0.35);
  next.ins = clampRating(next.ins + longArm * 0.35);
  next.drb = clampRating(next.drb - longArm * 0.25 + shortArm * 0.65);
  next.tp = clampRating(next.tp - longArm * 0.15 + shortArm * 0.45);
  next.fg = clampRating(next.fg - longArm * 0.1 + shortArm * 0.35);
  next.spd = clampRating(next.spd - Math.max(0, longArm - 5) * 0.25 + shortArm * 0.35);

  return next;
}

export function calculateCreatorOverall(rating: Partial<CreatorRatings>): number {
  const r: CreatorRatings = {
    hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
    ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
    oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
    ...rating,
  };
  const scoringStats = [r.ins, r.dnk, r.ft, r.fg, r.tp].sort((a, b) => b - a);
  const topScoring = (scoringStats[0] + scoringStats[1] + scoringStats[2]) / 3;
  const avgScoring = (r.ins + r.dnk + r.ft + r.fg + r.tp) / 5;
  const scoring = topScoring * 0.7 + avgScoring * 0.3;
  const physicals = (r.hgt * 1.5 + r.stre + r.spd * 1.2 + r.jmp + r.endu * 1.3) / 6;
  const playmaking = (r.drb * 0.9 + r.pss * 0.9 + r.oiq * 1.2) / 3;
  const defense = (r.diq * 1.2 + r.reb * 0.9 + r.hgt * 0.9) / 3;
  let rawOvr = scoring * 0.35 + playmaking * 0.25 + defense * 0.2 + physicals * 0.2;
  if (rawOvr > 80) rawOvr = 80 + (rawOvr - 80) * 1.2;
  else if (rawOvr < 60) rawOvr *= 0.95;
  return Math.max(25, Math.min(99, Math.round(rawOvr)));
}

export function archetypeToRatings(archetype: string, heightIn?: number): CreatorRatings {
  const profile = ARCHETYPE_PROFILES[archetype] ?? ARCHETYPE_PROFILES['All-Around Wing'];
  const ratings = {} as CreatorRatings;
  for (const key of CREATOR_RATING_KEYS) {
    ratings[key] = clampRating(profile[key] ?? 50);
  }
  if (heightIn != null) ratings.hgt = heightToRating(heightIn);
  return ratings;
}

export function getArchetypeMatches(ratings: Partial<CreatorRatings>, limit = 3): Array<{ name: string; score: number }> {
  const keys = CREATOR_RATING_KEYS.filter(k => k !== 'hgt');
  return Object.entries(ARCHETYPE_PROFILES)
    .map(([name, profile]) => {
      const mse = keys.reduce((sum, key) => {
        const delta = (ratings[key] ?? 50) - (profile[key] ?? 50);
        return sum + delta * delta;
      }, 0) / keys.length;
      const score = Math.max(0, Math.round(100 - Math.sqrt(mse) * 2.2));
      return { name, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildContractYears(amountM: number, startYear: number, expYear: number) {
  const years = Math.max(1, Math.min(6, expYear - startYear + 1));
  const salaryUSD = Math.max(0, Math.round(amountM * 1_000_000));
  return Array.from({ length: years }, (_, i) => {
    const yr = startYear + i;
    return {
      season: `${yr - 1}-${String(yr).slice(-2)}`,
      guaranteed: salaryUSD,
      option: '',
    };
  });
}

export function buildCreatedPlayer(form: PlayerCreatorForm, context: PlayerCreatorContext): NBAPlayer {
  const season = context.season;
  const firstName = form.firstName.trim() || 'Created';
  const lastName = form.lastName.trim() || 'Player';
  const name = `${firstName} ${lastName}`.trim();
  const heightIn = Math.max(60, Math.min(91, Math.round(form.heightIn)));
  const weightLbs = Math.max(140, Math.min(340, Math.round(form.weightLbs)));
  const wingspanIn = Math.max(heightIn - 4, Math.min(heightIn + 12, Math.round(form.wingspanIn)));
  const ratings = applyBuildAdjustments(form.ratings, heightIn, wingspanIn, weightLbs);
  const ovr = calculateCreatorOverall(ratings);
  const pot = Math.max(ovr, clampRating(form.potential || potEstimator(ovr, form.age)));
  const assignment = form.assignment;
  const externalTeam = context.nonNBATeams.find(t => t.tid === form.tid);

  let tid = form.tid;
  let status: NBAPlayer['status'] = 'Active';
  if (assignment === 'freeAgent') {
    tid = -1;
    status = 'Free Agent';
  } else if (assignment === 'draftProspect') {
    tid = -2;
    status = 'Draft Prospect';
  } else if (assignment === 'retired') {
    tid = -3;
    status = 'Retired';
  } else if (assignment === 'external') {
    tid = externalTeam?.tid ?? form.tid;
    status = (externalTeam?.league ?? form.externalStatus ?? 'G-League') as NBAPlayer['status'];
  }

  const hasContract = assignment === 'nba' || assignment === 'external';
  const contractAmountK = Math.max(0, Math.round((form.contractAmountM || 0) * 1000));
  const contractExp = Math.max(season, Math.round(form.contractExp || season));
  const draftTid = form.draftTid === -2 ? -1 : form.draftTid;
  const player: any = {
    internalId: `created-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tid,
    name,
    firstName,
    lastName,
    jerseyNumber: form.jerseyNumber.trim(),
    pos: form.pos,
    age: form.age,
    born: { year: season - form.age, loc: form.country || 'USA' },
    hgt: heightIn,
    weight: weightLbs,
    college: form.college.trim(),
    imgURL: form.imgURL?.trim() || undefined,
    draft: {
      year: Math.round(form.draftYear || season),
      round: Math.max(0, Math.min(2, Math.round(form.draftRound || 0))),
      pick: Math.max(0, Math.min(60, Math.round(form.draftPick || 0))),
      tid: draftTid,
      originalTid: draftTid,
    },
    ratings: [{
      season,
      ...ratings,
      ovr,
      pot,
      skills: [],
    }],
    overallRating: ovr,
    potential: pot,
    status,
    injury: form.injuryType && (form.injuryGames ?? 0) > 0
      ? { type: form.injuryType, gamesRemaining: Math.round(form.injuryGames ?? 0), startDate: context.date }
      : undefined,
    hof: form.hof,
    moodTraits: form.moodTraits as any,
    contract: hasContract ? { amount: contractAmountK, exp: contractExp } : undefined,
    ...(hasContract ? { contractYears: buildContractYears(form.contractAmountM, season, contractExp) } : {}),
    ...(assignment === 'retired' ? { retiredYear: form.retiredYear ?? season } : {}),
    face: form.imgURL?.trim() ? undefined : (form.face ?? generateBasketballFace({ race: form.race, gender: form.gender })),
    race: form.race,
    nationality: form.country || 'USA',
    finalHgt: heightIn,
    finalWeight: weightLbs,
    wingspanIn,
    handedness: form.handedness,
    drivingDunk: clampRating(form.drivingDunk),
    standingDunk: clampRating(form.standingDunk),
    durability: clampRating(form.durability),
    composure: clampRating(form.composure),
    clutch: clampRating(form.clutch),
    workEthic: clampRating(form.workEthic),
    archetype: form.archetype,
    ratingsLocked: form.ratingsLocked,
  };

  return player as NBAPlayer;
}
