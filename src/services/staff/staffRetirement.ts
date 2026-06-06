import type { GameState, NBATeam, StaffMember } from '../../types';
import { getTeamFullName } from '../../utils/teamNames';

export type StaffMotivationType =
  | 'legacy_winner'
  | 'loyalist'
  | 'money_driven'
  | 'fame_media'
  | 'family_first'
  | 'hooper_addict'
  | 'burned_out'
  | 'mentor';

export type StaffRetirementReason = 'age' | 'health' | 'family' | 'burnout' | 'legacy' | 'media' | 'advisor';
export type StaffPostRetirementPath = 'tv_analyst' | 'team_advisor' | 'youth_academy' | 'hof_voter' | 'agent' | 'none';

export interface StaffRetirementRecord {
  id: string;
  staffId?: string;
  name: string;
  role: string;
  portraitUrl?: string;
  staffImageId?: number;
  face?: unknown;
  teamName: string;
  teamId?: number;
  teamAbbrev?: string;
  teamLogoUrl?: string;
  leagueId?: string;
  age: number;
  season: number;
  retiredDate: string;
  reason: StaffRetirementReason;
  reasonLabel: string;
  motivation: StaffMotivationType;
  desireScore: number;
  yearsExperience: number;
  experienceLabel: string;
  yearsWithTeam: number;
  sourcePlayerId?: string;
  postRetirementPath: StaffPostRetirementPath;
  farewellTourEligible: boolean;
  offseasonRow: 'staffSignings';
  requiresReplacement: boolean;
}

type TeamWithStaff = Partial<Pick<NBATeam, 'id' | 'name' | 'region' | 'abbrev' | 'logoUrl'>> & {
  tid?: number;
  wins?: number;
  losses?: number;
  seasons?: Array<{ won?: number; wins?: number; lost?: number; losses?: number; playoffRoundsWon?: number }>;
  manualTeamStatus?: string;
  ownerProfile?: { consecutiveBadSeasons?: number };
  justWonEndesa?: boolean;
  justReachedEuroFinalFour?: boolean;
  lastEuroAwayGames?: number;
  tycoon?: {
    staffMembers?: StaffMember[];
  } | null;
};

const REASON_LABELS: Record<StaffRetirementReason, string> = {
  age: 'retired after a long career',
  health: 'stepped away for health reasons',
  family: 'stepped away to spend more time with family',
  burnout: 'stepped away after the season',
  legacy: 'retired on top after a career year',
  media: 'left the bench for a media opportunity',
  advisor: 'moved into an advisory role',
};

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function staffKey(member: StaffMember, role: string, teamId: number | undefined): string {
  return `${teamId ?? 'league'}:${member.id ?? member.sourcePlayerId ?? member.name}:${role}`;
}

export function getStaffRole(member: StaffMember): string {
  return member.role ?? member.position ?? member.jobTitle ?? 'Staff';
}

export function inferStaffAge(member: StaffMember, currentYear: number): number {
  const bornYear = Number(member.bornYear ?? (member as any).born?.year ?? 0);
  if (bornYear > 0) return Math.max(18, currentYear - bornYear);
  const careerStartYear = Number(member.careerStartYear ?? 0);
  if (careerStartYear > 0) return Math.max(30, currentYear - careerStartYear + 30);
  return 44 + (hashSeed(`${member.id ?? member.name}:age`) % 22);
}

export function inferStaffYearsExperience(member: StaffMember, currentYear: number, age: number): number {
  const careerStartYear = Number(member.careerStartYear ?? 0);
  if (careerStartYear > 0) return Math.max(0, currentYear - careerStartYear);
  return Math.max(0, age - 30);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function ageDesire(age: number): number {
  if (age < 45) return 0;
  if (age < 50) return 2;
  if (age < 55) return 7;
  if (age < 60) return 15;
  if (age < 65) return 28;
  if (age < 70) return 45;
  if (age < 75) return 64;
  return 82;
}

function inferMotivation(member: StaffMember, role: string, seed: number): StaffMotivationType {
  const stored = (member as any).motivationType as StaffMotivationType | undefined;
  if (stored) return stored;
  if (member.sourcePlayerId && (seed % 4) === 0) return 'hooper_addict';
  if (role === 'Chief Scout' || role === 'Player Development Coach') return (seed % 3) === 0 ? 'mentor' : 'loyalist';
  if (role === 'Head of Analytics') return (seed % 3) === 0 ? 'fame_media' : 'money_driven';
  if (role === 'Head Physio' || role === 'Head of Sports Science') return (seed % 2) === 0 ? 'family_first' : 'mentor';
  if (role === 'Head Coach') return (seed % 5) === 0 ? 'legacy_winner' : 'hooper_addict';
  if ((seed % 13) === 0) return 'burned_out';
  if ((seed % 7) === 0) return 'fame_media';
  return 'loyalist';
}

function roleDesire(role: string, age: number): number {
  const baseRole = role.replace(/ \d+$/, '');
  if (baseRole === 'Head of Sports Science') return age >= 58 ? 10 : 4;
  if (baseRole === 'Head Physio') return age >= 60 ? 8 : 2;
  if (baseRole === 'Chief Scout') return age >= 68 ? -8 : -12;
  if (baseRole === 'Head of Analytics') return age >= 52 ? 6 : 2;
  if (baseRole === 'Assistant Coach') return age >= 55 ? 5 : 1;
  if (baseRole === 'Head Coach') return age >= 62 ? 4 : -2;
  return 0;
}

function teamWindowScore(team: TeamWithStaff): number {
  const wins = Number((team as any).wins ?? 0);
  const losses = Number((team as any).losses ?? 0);
  const games = wins + losses;
  const winPct = games > 0 ? wins / games : 0.5;
  const seasons = ((team as any).seasons ?? []) as Array<{ won?: number; wins?: number; lost?: number; losses?: number; playoffRoundsWon?: number }>;
  const recent = seasons.slice(-3);
  const recentBadSeasons = recent.filter(season => {
    const won = Number(season.won ?? season.wins ?? 0);
    const lost = Number(season.lost ?? season.losses ?? 0);
    return won + lost > 0 && won / (won + lost) < 0.4;
  }).length;
  const recentDeepRuns = recent.filter(season => Number(season.playoffRoundsWon ?? 0) >= 2).length;
  const ownerBadSeasons = Number((team as any).ownerProfile?.consecutiveBadSeasons ?? 0);
  const manualStatus = String((team as any).manualTeamStatus ?? '');

  let score = 0;
  if (winPct >= 0.62 || recentDeepRuns > 0 || manualStatus === 'contending' || manualStatus === 'win_now') score -= 18;
  if (winPct < 0.38 || recentBadSeasons >= 2 || ownerBadSeasons >= 2 || manualStatus === 'rebuilding') score += 16;
  if ((team as any).justWonEndesa || (team as any).justReachedEuroFinalFour) score -= 12;
  return score;
}

function careerSatisfactionScore(member: StaffMember, team: TeamWithStaff, age: number, yearsExperience: number): number {
  const rating = Number((member as any).rating ?? member.reputation ?? 65);
  const salary = Number((member as any).salary ?? 0);
  const seasons = ((team as any).seasons ?? []) as Array<{ playoffRoundsWon?: number }>;
  const titles = seasons.filter(season => Number(season.playoffRoundsWon ?? 0) >= 4).length;
  const deepRuns = seasons.filter(season => Number(season.playoffRoundsWon ?? 0) >= 2).length;
  const wealthScore = salary >= 5_000_000 ? 8 : salary >= 2_000_000 ? 4 : salary > 0 ? -4 : 0;
  const legacy = (titles * 13) + (deepRuns * 4) + (rating >= 86 ? 8 : rating >= 78 ? 4 : 0);
  if (age >= 62 && yearsExperience >= 25) return legacy + wealthScore;
  return Math.round((legacy + wealthScore) * 0.45);
}

function motivationScore(motivation: StaffMotivationType, args: {
  member: StaffMember;
  team: TeamWithStaff;
  age: number;
  yearsExperience: number;
}): number {
  const { member, team, age, yearsExperience } = args;
  const salary = Number((member as any).salary ?? 0);
  const yearsWithTeam = Number(member.yearsWithTeam ?? 0);
  const contending = teamWindowScore(team) < 0;
  switch (motivation) {
    case 'legacy_winner':
      return contending ? -22 : age >= 67 && careerSatisfactionScore(member, team, age, yearsExperience) < 10 ? -10 : 4;
    case 'loyalist':
      return yearsWithTeam >= 5 ? -16 : -5;
    case 'money_driven':
      return salary >= 3_000_000 ? -18 : 6;
    case 'fame_media':
      return age >= 48 ? 14 : 6;
    case 'family_first':
      return age >= 50 ? 16 : 8;
    case 'hooper_addict':
      return age >= 72 ? -10 : -22;
    case 'burned_out':
      return 26;
    case 'mentor':
      return age >= 65 ? 6 : -8;
  }
}

function stressHealthScore(member: StaffMember, team: TeamWithStaff, seed: number, age: number): number {
  const healthDurability = Number((member as any).healthDurability ?? (45 + (seed % 41)));
  const stressTolerance = Number((member as any).stressTolerance ?? (45 + ((seed >>> 4) % 41)));
  const travelLoad = Number((team as any).lastEuroAwayGames ?? 0);
  const pressure = teamWindowScore(team) < 0 ? 8 : 0;
  let score = 0;
  if (age >= 60 && healthDurability < 55) score += 12;
  if (age >= 65 && healthDurability < 45) score += 18;
  if (stressTolerance < 45) score += 8;
  if (travelLoad >= 12 && age >= 58) score += 6;
  score += pressure;
  return score;
}

function desireToChance(score: number): number {
  if (score < 20) return 1;
  if (score < 40) return 7;
  if (score < 60) return 22;
  if (score < 80) return 48;
  return 82;
}

function calculateRetirementDesire(args: {
  member: StaffMember;
  team: TeamWithStaff;
  role: string;
  age: number;
  yearsExperience: number;
  motivation: StaffMotivationType;
  seed: number;
}): number {
  const { member, team, role, age, yearsExperience, motivation, seed } = args;
  const contractYears = Number(member.contractYears ?? 1);
  const expiringContract = contractYears <= 0 ? 8 : contractYears === 1 ? 3 : -4;
  const satisfaction = careerSatisfactionScore(member, team, age, yearsExperience);
  const satisfactionPressure = satisfaction >= 24 ? 14 : satisfaction <= 3 && age >= 60 ? -10 : 0;
  const chaos = ((seed >>> 8) % 21) - 10;
  return clampScore(
    ageDesire(age)
    + roleDesire(role, age)
    + teamWindowScore(team)
    + satisfactionPressure
    + motivationScore(motivation, { member, team, age, yearsExperience })
    + stressHealthScore(member, team, seed, age)
    + expiringContract
    + chaos,
  );
}

function pickReason(args: {
  member: StaffMember;
  motivation: StaffMotivationType;
  seed: number;
  age: number;
  yearsExperience: number;
  desireScore: number;
}): StaffRetirementReason {
  const { member, motivation, seed, age, yearsExperience, desireScore } = args;
  if (motivation === 'fame_media' && age >= 48 && (seed % 3) === 0) return 'media';
  if (motivation === 'mentor' && yearsExperience >= 25 && (seed % 4) === 0) return 'advisor';
  if (motivation === 'family_first' && age >= 50) return 'family';
  if (motivation === 'burned_out' || desireScore >= 70 && (seed % 5) === 0) return 'burnout';
  if (age >= 66 && ((seed >>> 3) % 9) === 0) return 'health';
  if (yearsExperience >= 35 && ((seed >>> 5) % 4) === 0) return 'legacy';
  return member.contractYears != null && member.contractYears <= 0 && age < 64 ? 'burnout' : 'age';
}

function pickPostRetirementPath(motivation: StaffMotivationType, reason: StaffRetirementReason, seed: number): StaffPostRetirementPath {
  if (reason === 'media' || motivation === 'fame_media') return 'tv_analyst';
  if (reason === 'advisor' || motivation === 'loyalist') return 'team_advisor';
  if (motivation === 'mentor') return 'youth_academy';
  if (motivation === 'money_driven' && (seed % 5) === 0) return 'agent';
  if (reason === 'legacy' && (seed % 3) === 0) return 'hof_voter';
  return 'none';
}

export function evaluateStaffRetirement(args: {
  member: StaffMember;
  team: TeamWithStaff;
  currentYear: number;
  date: string;
}): StaffRetirementRecord | null {
  const { member, team, currentYear, date } = args;
  if (member.retiredYear || member.retiredDate || member.diedYear || member.diedDate) return null;

  const role = getStaffRole(member);
  const teamId = team.id ?? team.tid;
  const teamName = getTeamFullName(team as unknown as NBATeam);
  const age = inferStaffAge(member, currentYear);
  const yearsExperience = inferStaffYearsExperience(member, currentYear, age);
  const seed = hashSeed(`staff-retire:${staffKey(member, role, teamId)}:${currentYear}`);
  const motivation = inferMotivation(member, role, seed);
  const desireScore = calculateRetirementDesire({ member, team, role, age, yearsExperience, motivation, seed });
  const chance = desireToChance(desireScore);
  if (((seed >>> 16) % 100) >= chance) return null;

  const reason = pickReason({ member, motivation, seed, age, yearsExperience, desireScore });
  const postRetirementPath = pickPostRetirementPath(motivation, reason, seed);
  return {
    id: `staff-retire-${teamId ?? 'team'}-${String(member.id ?? member.name).replace(/[^a-z0-9]+/gi, '-')}-${currentYear}`,
    staffId: member.id,
    name: member.name,
    role,
    portraitUrl: member.playerPortraitUrl,
    staffImageId: member.staffImageId,
    face: member.face,
    teamName,
    teamId,
    teamAbbrev: team.abbrev,
    teamLogoUrl: team.logoUrl,
    leagueId: member.leagueId,
    age,
    season: currentYear,
    retiredDate: date,
    reason,
    reasonLabel: REASON_LABELS[reason],
    motivation,
    desireScore,
    yearsExperience,
    experienceLabel: `${yearsExperience} yr${yearsExperience === 1 ? '' : 's'}`,
    yearsWithTeam: Math.max(0, Number(member.yearsWithTeam ?? 0)),
    sourcePlayerId: member.sourcePlayerId,
    postRetirementPath,
    farewellTourEligible: yearsExperience >= 30 && Number((member as any).rating ?? member.reputation ?? 0) >= 82,
    offseasonRow: 'staffSignings',
    requiresReplacement: true,
  };
}

export function markStaffRetired(member: StaffMember, record: StaffRetirementRecord): StaffMember {
  return {
    ...member,
    retiredYear: record.season,
    retiredDate: record.retiredDate,
    retirementReason: record.reason,
    retirementReasonLabel: record.reasonLabel,
  } as StaffMember;
}

export function staffRetirementHistory(record: StaffRetirementRecord): { text: string; date: string; type: 'Personnel'; tid?: number } {
  const displayRole = String(record.role ?? 'Staff').replace(/ \d+$/, '');
  return {
    text: `${record.name} retired from the ${record.teamName} staff as ${displayRole}.`,
    date: record.retiredDate,
    type: 'Personnel',
    ...(record.teamId != null ? { tid: record.teamId } : {}),
  };
}

export function processStaffRetirementsForTeams<T extends TeamWithStaff>(
  teams: T[],
  currentYear: number,
  date: string,
): {
  teams: T[];
  retirements: StaffRetirementRecord[];
  historyEntries: NonNullable<GameState['history']>;
} {
  const retirements: StaffRetirementRecord[] = [];
  const historyEntries: NonNullable<GameState['history']> = [];
  const teamsOut = teams.map(team => {
    const members = team.tycoon?.staffMembers ?? [];
    if (members.length === 0) return team;

    const nextMembers: StaffMember[] = [];
    for (const member of members) {
      const record = evaluateStaffRetirement({ member, team, currentYear, date });
      if (!record) {
        nextMembers.push(member);
        continue;
      }
      retirements.push(record);
      historyEntries.push(staffRetirementHistory(record));
    }

    if (nextMembers.length === members.length) return team;
    return {
      ...team,
      tycoon: {
        ...team.tycoon,
        staffMembers: nextMembers,
      },
    } as T;
  });

  return { teams: teamsOut, retirements, historyEntries };
}
