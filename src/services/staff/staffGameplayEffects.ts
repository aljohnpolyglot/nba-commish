import type { NBATeam, NBAPlayer } from '../../types';
import type { StaffAttributes } from '../../TeamTraining/types';
import { attrsForCoach, seedForStaff } from './displayAttributes';
import { medicalQuality } from '../tycoon/medicalEngine';

const COACH_NEUTRAL = 60;
const DEV_NEUTRAL = 70;
const MAX_STAFF_ATTR = 99;
const MIN_STAFF_ATTR = 40;
const ASSISTANT_ROLES = ['Assistant Coach', 'Assistant Coach 2', 'Assistant Coach 3'] as const;
const NEUTRAL_STAFF_ATTRS: StaffAttributes = {
  offense: 60,
  defense: 60,
  tactics: 60,
  development: 60,
  conditioning: 60,
  adaptability: 60,
  determination: 60,
  levelOfDiscipline: 60,
  manManagement: 60,
  motivating: 60,
  physiotherapy: 60,
  sportsScience: 60,
  judgingPlayerAbility: 60,
  judgingPlayerPotential: 60,
  negotiating: 60,
};

type TeamWithStaff = NBATeam & {
  tycoon?: {
    staffMembers?: Array<{
      id?: string;
      role?: string;
      name?: string;
      rating?: number;
      reputation?: number;
      attributeSeed?: number;
    }>;
    medicalBudget?: number;
  };
};

export interface TeamCoachingGameplayEffects {
  regularStrengthBonus: number;
  playoffStrengthBonus: number;
  offenseScale: number;
  defenseScale: number;
  defensiveAuraBonus: number;
  defensiveTrainingMultiplier: number;
  dramaMultiplier: number;
}

export interface TeamMedicalGameplayEffects {
  injuryRiskMultiplier: number;
  recoveryMultiplier: number;
}

type GameplayRatingKey =
  | 'oiq'
  | 'ins'
  | 'tp'
  | 'fg'
  | 'dnk'
  | 'diq'
  | 'reb'
  | 'stre'
  | 'spd'
  | 'jmp';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getStaffMembers(team?: TeamWithStaff | null) {
  return Array.isArray(team?.tycoon?.staffMembers) ? team!.tycoon!.staffMembers! : [];
}

function isNBATeam(team?: TeamWithStaff | null): boolean {
  const tid = Number(team?.id ?? (team as any)?.tid ?? -1);
  return tid >= 0 && tid < 100;
}

function getStaffMember(team: TeamWithStaff | null | undefined, role: string) {
  return getStaffMembers(team).find(member => member?.role === role) ?? null;
}

function getStaffAttrs(member: { name?: string; attributeSeed?: number; rating?: number; reputation?: number } | null | undefined): StaffAttributes | null {
  if (!member?.name) return null;
  return attrsForCoach(member.name, seedForStaff(member));
}

function getRoleAttrs(team: TeamWithStaff | null | undefined, role: string): StaffAttributes | null {
  return getStaffAttrs(getStaffMember(team, role));
}

function averageNumbers(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageAssistantAttr(team: TeamWithStaff | null | undefined, key: keyof StaffAttributes): number {
  const values = ASSISTANT_ROLES.map(role => getRoleAttrs(team, role)?.[key] ?? COACH_NEUTRAL);
  return averageNumbers(values);
}

function buildAssistantAttrs(team: TeamWithStaff | null | undefined): StaffAttributes {
  const keys = Object.keys(NEUTRAL_STAFF_ATTRS) as Array<keyof StaffAttributes>;
  const next = { ...NEUTRAL_STAFF_ATTRS };
  for (const key of keys) next[key] = averageAssistantAttr(team, key);
  return next;
}

function scaleAroundNeutral(value: number, neutral = COACH_NEUTRAL): number {
  const denom = value >= neutral ? MAX_STAFF_ATTR - neutral : neutral - MIN_STAFF_ATTR;
  if (denom <= 0) return 0;
  return clamp((value - neutral) / denom, -1, 1);
}

function weightedCoachStrength(attrs: StaffAttributes, phase: 'regular' | 'playoff'): number {
  return phase === 'playoff'
    ? attrs.tactics * 0.65 + attrs.motivating * 0.35
    : attrs.motivating * 0.60 + attrs.tactics * 0.40;
}

export function getTeamCoachingGameplayEffects(team?: TeamWithStaff | null): TeamCoachingGameplayEffects {
  const head = getRoleAttrs(team, 'Head Coach') ?? NEUTRAL_STAFF_ATTRS;
  const assistants = buildAssistantAttrs(team);
  const headRegular = scaleAroundNeutral(weightedCoachStrength(head, 'regular')) * 5;
  const assistantRegular = scaleAroundNeutral(weightedCoachStrength(assistants, 'regular')) * 5;
  const headPlayoff = scaleAroundNeutral(weightedCoachStrength(head, 'playoff')) * 5;
  const assistantPlayoff = scaleAroundNeutral(weightedCoachStrength(assistants, 'playoff')) * 5;
  const offenseScale = scaleAroundNeutral(head.offense) + scaleAroundNeutral(assistants.offense);
  const defenseScale = scaleAroundNeutral(head.defense) + scaleAroundNeutral(assistants.defense);
  const defensiveTrainingBase = averageNumbers([
    scaleAroundNeutral(head.defense),
    scaleAroundNeutral(assistants.defense),
  ]);
  const managementBase = averageNumbers([
    scaleAroundNeutral(head.manManagement),
    scaleAroundNeutral(assistants.manManagement),
  ]);

  return {
    regularStrengthBonus: clamp(headRegular + assistantRegular, -10, 10),
    playoffStrengthBonus: clamp(headPlayoff + assistantPlayoff, -10, 10),
    offenseScale: clamp(offenseScale, -2, 2),
    defenseScale: clamp(defenseScale, -2, 2),
    defensiveAuraBonus: clamp((scaleAroundNeutral(head.defense) + scaleAroundNeutral(assistants.defense)) * 6, -12, 12),
    defensiveTrainingMultiplier: clamp(1 + defensiveTrainingBase * 0.35, 0.65, 1.35),
    dramaMultiplier: clamp(1 - managementBase * 0.35, 0.65, 1.35),
  };
}

export function getTeamMedicalGameplayEffects(team?: TeamWithStaff | null): TeamMedicalGameplayEffects {
  const sportsScience = getRoleAttrs(team, 'Head of Sports Science') ?? NEUTRAL_STAFF_ATTRS;
  const physio = getRoleAttrs(team, 'Head Physio') ?? NEUTRAL_STAFF_ATTRS;
  const sportsScienceAvg = averageNumbers([
    sportsScience.conditioning,
    sportsScience.physiotherapy,
    sportsScience.sportsScience,
  ]);
  const physioAvg = averageNumbers([
    physio.conditioning,
    physio.physiotherapy,
    physio.sportsScience,
  ]);
  const injuryScale = scaleAroundNeutral(sportsScienceAvg);
  const staffRecoveryScale = scaleAroundNeutral(physioAvg);
  const facilityRecoveryScale = medicalQuality(team?.tycoon?.medicalBudget) * 2 - 1;
  const recoveryScale = isNBATeam(team)
    ? staffRecoveryScale
    : facilityRecoveryScale * 0.7 + staffRecoveryScale * 0.3;

  return {
    injuryRiskMultiplier: clamp(1 - injuryScale * 0.5, 0.5, 1.35),
    recoveryMultiplier: clamp(1 + recoveryScale * 0.5, 0.5, 1.5),
  };
}

export function getTeamDevelopmentMultiplier(team?: TeamWithStaff | null): number {
  const devCoach = getRoleAttrs(team, 'Player Development Coach');
  if (!devCoach) return 1;
  const devAverage = averageNumbers([devCoach.development, devCoach.adaptability]);
  const scale = scaleAroundNeutral(devAverage, DEV_NEUTRAL);
  return clamp(1 + (scale >= 0 ? scale * 0.5 : scale * 0.3), 0.7, 1.5);
}

export function getTeamScoutingFuzzBand(team: TeamWithStaff | null | undefined, kind: 'draft' | 'current'): number {
  const role = kind === 'draft' ? 'Chief Scout' : 'Head of Analytics';
  const attrs = getRoleAttrs(team, role);
  if (!attrs) return 4;
  const average = averageNumbers([attrs.judgingPlayerAbility, attrs.judgingPlayerPotential]);
  const scale = scaleAroundNeutral(average);
  return clamp(Math.round(4 - scale * 4), 0, 8);
}

function cloneLatestRatings(player: NBAPlayer): { player: NBAPlayer; rating: any } | null {
  const index = Array.isArray(player.ratings) ? player.ratings.length - 1 : -1;
  if (index < 0) return null;
  const current = player.ratings[index];
  if (!current) return null;
  const rating = { ...current };
  const ratings = player.ratings.map((entry, idx) => (idx === index ? rating : entry));
  return { player: { ...player, ratings }, rating };
}

export function applyStaffGameEffectsToRoster(
  roster: NBAPlayer[],
  team?: TeamWithStaff | null,
): NBAPlayer[] {
  if (!team || roster.length === 0) return roster;
  const effects = getTeamCoachingGameplayEffects(team);
  if (
    Math.abs(effects.offenseScale) < 0.001 &&
    Math.abs(effects.defenseScale) < 0.001 &&
    Math.abs(effects.defensiveAuraBonus) < 0.001
  ) {
    return roster;
  }

  const offense = effects.offenseScale;
  const defense = effects.defenseScale;
  return roster.map(player => {
    const cloned = cloneLatestRatings(player);
    if (!cloned) return player;
    const { rating } = cloned;
    const deltas: Partial<Record<GameplayRatingKey, number>> = {
      oiq: 5 * offense,
      ins: 2 * offense,
      tp: 2 * offense,
      fg: 2 * offense,
      dnk: 2 * offense,
      diq: 5 * defense,
      reb: 2 * defense,
      stre: 2 * defense,
      spd: 1 * defense,
      jmp: 1 * defense,
    };

    for (const [key, delta] of Object.entries(deltas)) {
      if (typeof rating[key] !== 'number' || !delta) continue;
      rating[key] = clamp(rating[key] + delta, 20, 99);
    }

    return cloned.player;
  });
}

export function getStaffGameplayTooltip(
  role: string,
  team?: TeamWithStaff | null,
): string {
  const baseRole = role.replace(/ \d+$/, '');
  void team;

  switch (baseRole) {
    case 'Head Coach':
      return 'Shapes the game plan, sharpens execution, and steadies the team in big moments.';
    case 'Assistant Coach':
      return 'Reinforces the system every day in practice, opponent prep, and bench adjustments.';
    case 'Head of Sports Science':
      return 'Keeps workloads smart, lowers wear and tear, and helps the squad stay healthier over the season.';
    case 'Head Physio':
      return 'Improves recovery, helps players bounce back faster, and supports return-to-play work.';
    case 'Player Development Coach':
      return 'Drives skill growth, especially for younger players still climbing toward their ceiling.';
    case 'Chief Scout':
      return 'Improves how clearly you read draft talent and future upside before draft night.';
    case 'Head of Analytics':
      return 'Sharpens your read on current players, lineup value, and where real strengths or weaknesses sit.';
    default:
      return 'Helps keep standards high, the locker room steady, and the staff room aligned behind the same direction.';
  }
}
