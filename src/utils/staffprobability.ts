import type { NBAPlayer, StaffMember } from '../types';
import type { StaffAttributes } from '../TeamTraining/types';
import { getStaffMarketSalary } from '../services/tycoon/economyScale';
import { deterministicStaffImageId } from './staffPortrait';

const STAFF_JOIN_CUTOFF = 30;

type PeakRatings = {
  oiq: number;
  diq: number;
  pss: number;
  tp: number;
  ft: number;
  spd: number;
  jmp: number;
  stre: number;
  hgt: number;
};

export interface StaffProbabilityResult {
  staffJoinChance: number;
  rawScore: number;
  role: 'Head Coach' | 'Assistant Coach' | 'Player Development Coach';
  badge: string;
  peakRatings: PeakRatings;
  totalGP: number;
  attributes: StaffAttributes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) || 1) / 0xffffffff;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function inferStaffLeagueContext(player: NBAPlayer): { leagueId: string; market: 'nba' | 'euro' } {
  const tidsFromStats = (player.stats ?? [])
    .filter((s: any) => !s.playoffs && typeof s.tid === 'number' && (s.gp ?? 0) > 0)
    .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))
    .map((s: any) => s.tid as number);
  const tidsFromTx = (player.transactions ?? [])
    .filter((tx: any) => typeof tx.tid === 'number')
    .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0))
    .map((tx: any) => tx.tid as number);
  const candidateTid = [...tidsFromStats, ...tidsFromTx, player.draft?.tid ?? -1]
    .find(tid => typeof tid === 'number' && tid >= 0);

  if (candidateTid == null || candidateTid < 0) return { leagueId: 'nba', market: 'nba' };
  if (candidateTid >= 0 && candidateTid < 100) return { leagueId: 'nba', market: 'nba' };
  if (candidateTid >= 1000 && candidateTid < 1100) return { leagueId: 'euroleague', market: 'euro' };
  if (candidateTid >= 5000 && candidateTid < 5100) return { leagueId: 'endesa', market: 'euro' };
  if (candidateTid >= 2000 && candidateTid < 2100) return { leagueId: 'pba', market: 'euro' };
  if (candidateTid >= 4000 && candidateTid < 4100) return { leagueId: 'bleague', market: 'euro' };
  if (candidateTid >= 7000 && candidateTid < 7100) return { leagueId: 'chinacba', market: 'euro' };
  if (candidateTid >= 8000 && candidateTid < 8100) return { leagueId: 'nblaus', market: 'euro' };
  return { leagueId: 'endesa', market: 'euro' };
}

function peakRatingsFor(player: NBAPlayer): PeakRatings {
  const ratings = player.ratings ?? [];
  const max = (key: keyof PeakRatings, fallback = 50) =>
    ratings.length > 0 ? Math.max(...ratings.map(row => Number(row?.[key] ?? fallback))) : Number((player as any)[key] ?? fallback);
  return {
    oiq: max('oiq'),
    diq: max('diq'),
    pss: max('pss'),
    tp: max('tp'),
    ft: max('ft'),
    spd: max('spd'),
    jmp: max('jmp'),
    stre: max('stre'),
    hgt: max('hgt', player.hgt ?? 50),
  };
}

function totalRegularSeasonGP(player: NBAPlayer): number {
  return (player.stats ?? [])
    .filter(stat => !(stat as any).playoffs)
    .reduce((sum, stat) => sum + (stat.gp ?? 0), 0);
}

function countAward(player: NBAPlayer, type: string): number {
  return (player.awards ?? []).filter(award => award.type === type).length;
}

function uniqueCareerTeams(player: NBAPlayer): number {
  const ids = new Set<number>();
  for (const stat of player.stats ?? []) {
    const tid = Number(stat.tid);
    if (!stat.playoffs && tid >= 0 && tid < 100 && (stat.gp ?? 0) > 0) ids.add(tid);
  }
  for (const tx of player.transactions ?? []) {
    const tid = Number(tx.tid);
    if (tid >= 0 && tid < 100) ids.add(tid);
  }
  return ids.size;
}

function staffChanceFromRaw(rawScore: number): number {
  const normalized = clamp((rawScore + 12) / 70, 0, 1);
  return Math.round(Math.pow(normalized, 1.55) * 1000) / 10;
}

function roleFor(player: NBAPlayer, chance: number, rawScore: number, peak: PeakRatings): StaffProbabilityResult['role'] {
  const allStars = countAward(player, 'All-Star');
  const isFloorGeneral = peak.oiq >= 68 && peak.pss >= 58;
  if ((chance >= 74 || rawScore >= 42) && isFloorGeneral && allStars <= 12) return 'Head Coach';
  if (peak.diq >= 68 || peak.oiq >= 62 || peak.pss >= 58) return 'Assistant Coach';
  return 'Player Development Coach';
}

function buildAttributes(player: NBAPlayer, role: StaffProbabilityResult['role'], peak: PeakRatings, totalGP: number, chance: number): StaffAttributes {
  const gpBoost = clamp(totalGP / 1200, 0, 1) * 10;
  const allStarBoost = Math.min(8, countAward(player, 'All-Star') * 1.5);
  const ringBoost = Math.min(6, countAward(player, 'Champion') * 2 + countAward(player, 'Won Championship') * 2);
  const base = 52 + chance * 0.28 + gpBoost;
  const iqBlend = (peak.oiq + peak.diq + peak.pss) / 3;
  const skillBlend = (peak.tp + peak.ft + peak.pss) / 3;
  const defenseBlend = (peak.diq + peak.stre + peak.hgt) / 3;
  const athleticBlend = (peak.spd + peak.jmp + peak.stre) / 3;
  const roleBump = (target: StaffProbabilityResult['role'], amount: number) => role === target ? amount : 0;
  const v = (value: number) => Math.round(clamp(value, 45, 96));

  return {
    offense: v(base + (peak.oiq - 50) * 0.25 + (skillBlend - 50) * 0.18 + roleBump('Head Coach', 5)),
    defense: v(base + (peak.diq - 50) * 0.30 + (defenseBlend - 50) * 0.12),
    tactics: v(base + (iqBlend - 50) * 0.35 + roleBump('Head Coach', 8) + roleBump('Assistant Coach', 4)),
    development: v(base + (skillBlend - 50) * 0.22 + roleBump('Player Development Coach', 10) + allStarBoost * 0.4),
    conditioning: v(58 + (athleticBlend - 50) * 0.12 + gpBoost * 0.5),
    adaptability: v(base + uniqueCareerTeams(player) * 1.5),
    determination: v(base + ringBoost + allStarBoost * 0.4),
    levelOfDiscipline: v(base + (peak.diq - 50) * 0.18 + ringBoost),
    manManagement: v(base + allStarBoost + gpBoost * 0.3),
    motivating: v(base + ringBoost + allStarBoost + roleBump('Player Development Coach', 4)),
    physiotherapy: v(54 + gpBoost * 0.6),
    sportsScience: v(55 + (peak.oiq - 50) * 0.12 + gpBoost * 0.5),
    judgingPlayerAbility: v(base + (iqBlend - 50) * 0.22 + allStarBoost * 0.5),
    judgingPlayerPotential: v(base + (peak.pss - 50) * 0.22 + roleBump('Player Development Coach', 5)),
    negotiating: v(52 + allStarBoost + uniqueCareerTeams(player) * 1.2),
  };
}

export function computeStaffProbability(player: NBAPlayer): StaffProbabilityResult {
  const peak = peakRatingsFor(player);
  const totalGP = totalRegularSeasonGP(player);
  const gpNorm = Math.min(totalGP / 900, 1) * 100;
  const positive =
    peak.oiq * 0.22 +
    peak.diq * 0.18 +
    peak.pss * 0.18 +
    peak.tp * 0.12 +
    peak.ft * 0.10 +
    gpNorm * 0.20;
  const athletic = (peak.spd + peak.jmp + peak.stre + peak.hgt) / 4;
  let rawScore = positive - athletic * 0.35;

  const moodTraits = (player.moodTraits ?? []) as string[];
  if (moodTraits.includes('LOYAL') || moodTraits.includes('L')) rawScore += 6;
  if (moodTraits.includes('WINNER') || moodTraits.includes('W')) rawScore += 4;
  if (moodTraits.includes('FAME') || moodTraits.includes('F')) rawScore -= 6;
  if (moodTraits.includes('$') || moodTraits.includes('MERCENARY')) rawScore -= 8;

  const rings = countAward(player, 'Champion') + countAward(player, 'Won Championship');
  const mvpCount = countAward(player, 'Most Valuable Player');
  const finalsMvpCount = countAward(player, 'Finals MVP');
  const dpoyCount = countAward(player, 'Defensive Player of the Year');
  const sixthManCount = countAward(player, 'Sixth Man of the Year');
  rawScore += Math.min(rings * 4, 8);
  rawScore += player.pos === 'PG' ? 4 : player.pos?.includes('G') ? 2 : 0;
  rawScore += uniqueCareerTeams(player) >= 4 ? 3 : 0;
  rawScore += Math.min(dpoyCount * 3, 6);
  rawScore += Math.min(sixthManCount * 2, 4);
  rawScore -= Math.min(mvpCount * 7, 21);
  rawScore -= Math.min(finalsMvpCount * 5, 10);
  if ((player.draft?.pick ?? 99) <= 5) rawScore -= 4;
  if (peak.hgt >= 65 && peak.stre >= 75) rawScore -= 10;
  if (peak.spd >= 75 && peak.jmp >= 75) rawScore -= 8;

  const staffJoinChance = staffChanceFromRaw(rawScore);
  const role = roleFor(player, staffJoinChance, rawScore, peak);
  const badge = peak.pss >= 70
    ? 'Floor General'
    : peak.diq >= 72
      ? 'Defensive Mind'
      : staffJoinChance >= 70
        ? 'Bench Leader'
        : 'Player Development Path';

  return {
    staffJoinChance,
    rawScore,
    role,
    badge,
    peakRatings: peak,
    totalGP,
    attributes: buildAttributes(player, role, peak, totalGP, staffJoinChance),
  };
}

export function rollStaffJoin(player: NBAPlayer, year: number): boolean {
  const result = computeStaffProbability(player);
  if (result.staffJoinChance < STAFF_JOIN_CUTOFF) return false;
  return seededRandom(`retiree-staff-${player.internalId}-${year}`) < result.staffJoinChance / 100;
}

export function buildRetireeStaffCandidate(player: NBAPlayer, year: number): StaffMember | null {
  const result = computeStaffProbability(player);
  if (result.staffJoinChance < STAFF_JOIN_CUTOFF) return null;
  if (!rollStaffJoin(player, year)) return null;
  const rating = Math.round(clamp(56 + result.staffJoinChance * 0.38 + result.rawScore * 0.22, 55, 91));
  const role = result.role;
  const yearsExperience = Math.max(1, Math.round(result.totalGP / 82));
  const seed = hashSeed(`${player.internalId}-${year}-${role}`);
  const leagueCtx = inferStaffLeagueContext(player);
  return {
    id: `retiree-staff-${player.internalId}-${year}`,
    name: player.name,
    role,
    position: role,
    jobTitle: role,
    leagueId: leagueCtx.leagueId,
    team: '',
    nationality: player.born?.loc?.split(',').pop()?.trim() || 'American',
    playerPortraitUrl: player.imgURL,
    face: player.face,
    staffImageId: deterministicStaffImageId(player.name),
    bornYear: player.born?.year,
    careerStartYear: year,
    yearsWithTeam: 0,
    contractYears: 0,
    rating,
    reputation: rating,
    salary: getStaffMarketSalary(undefined, role, rating, {
      market: leagueCtx.market,
      yearsExperience,
      yearsWithTeam: 0,
    }),
    isPlaceholder: false,
    attributeSeed: seed,
    attributeProfile: 'default',
    attributeOverrides: result.attributes,
    sourcePlayerId: player.internalId,
    source: 'retired-player-staff',
    staffJoinChance: result.staffJoinChance,
    staffArchetype: result.badge,
  } as StaffMember;
}
