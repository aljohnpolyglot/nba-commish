import type { GameState, OffseasonRowStatus, StaffMember } from '../../types';
import { getCoachContractSnapshot, getTeamStaff } from '../staffService';
import {
  canonicalStaffSlotRole,
  getActiveTeamStaffMembers,
  hasPersistedStaffRoster,
  isActiveStaffContract,
  staffContractIdentityKey,
} from '../staff/activeStaffContracts';
import { resolveLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';
import { getTeamFullName } from '../../utils/teamNames';

export const STANDARD_REQUIRED_STAFF_ROLE_KEYS = [
  'Head Coach',
  'Assistant Coach',
  'Assistant Coach 2',
  'Assistant Coach 3',
  'Head of Sports Science',
  'Head Physio',
  'Player Development Coach',
  'Chief Scout',
  'Head of Analytics',
] as const;

export type StaffHiringVacancyReason =
  | 'retirement'
  | 'contract_expired'
  | 'termination'
  | 'required_role_empty';

export interface StaffHiringRequirements {
  cycleSeason: number;
  evaluatedAtDate: string;
  expiringStaffIds: string[];
  retiredStaffIds: string[];
  requiredVacancies: Array<{
    roleKey: string;
    previousStaffId?: string;
    reason: StaffHiringVacancyReason;
  }>;
  optionalVacancies: Array<{
    roleKey: string;
    reason: string;
  }>;
  unresolvedDecisionIds: string[];
  filledRequiredRoleKeys: string[];
  actionRequired: boolean;
  evidenceFingerprint: string;
}

export interface StaffHiresReviewEvidence {
  cycleSeason: number;
  requirementsFingerprint: string;
  disposition:
    | 'no_action_required'
    | 'required_actions_completed'
    | 'delegated_no_action'
    | 'delegated_actions_completed';
  expiringStaffCount: number;
  requiredVacancyCount: number;
  unresolvedDecisionCount: number;
  reviewedAtDate: string;
  reviewedBy: 'user' | 'assistant_gm' | 'commissioner_auto';
}

export type StaffHiresTaskPhase =
  | 'LOCKED'
  | 'REQUIREMENTS_EVALUATED'
  | 'ACTION_REQUIRED'
  | 'REVIEW_READY'
  | 'NO_ACTION_REVIEW_READY'
  | 'COMPLETE';

export interface StaffHiresTrainingBlocker {
  code: 'STAFF_HIRES_REVIEW_REQUIRED' | 'STAFF_HIRES_IN_PROGRESS' | 'STAFF_HIRING_REVIEW_READY';
  label: string;
  subtext: string;
}

type StaffRules = {
  enabled?: boolean;
  requiredRoleKeys?: string[];
  optionalRoleKeys?: string[];
};

type TeamLike = NonNullable<GameState['teams']>[number] & {
  tid?: number;
  tycoon?: {
    staffMembers?: StaffMember[];
    firedStaffRoles?: string[];
  };
};

const terminal = (status: OffseasonRowStatus | undefined) => status === 'done' || status === 'skipped';

const uniqueSorted = (values: Array<string | undefined>): string[] => (
  [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))].sort()
);

const stableFingerprint = (value: unknown): string => {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `staff-hires-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const staffId = (member: Partial<StaffMember> | undefined): string => (
  String(member?.id ?? member?.sourcePlayerId ?? staffContractIdentityKey(member) ?? '').trim()
);

const staffRole = (member: Partial<StaffMember> | undefined): string => (
  canonicalStaffSlotRole(member?.role ?? member?.position ?? member?.jobTitle)
);

const getManagedTeam = (state: GameState): TeamLike | undefined => {
  const teamId = Number(state.userTeamId);
  if (!Number.isFinite(teamId)) return undefined;
  return [
    ...(state.teams ?? []),
    ...((state.nonNBATeams ?? []) as unknown as TeamLike[]),
  ].find(team => Number((team as TeamLike).id ?? (team as TeamLike).tid) === teamId) as TeamLike | undefined;
};

const getRules = (state: GameState): StaffRules => {
  const leagueStats = state.leagueStats as typeof state.leagueStats & {
    staffManagementEnabled?: boolean;
    staffRules?: StaffRules;
  };
  if (leagueStats.staffManagementEnabled === false) return { enabled: false };
  return leagueStats.staffRules ?? {};
};

const effectiveLegacyMembers = (state: GameState, team: TeamLike, currentYear: number): StaffMember[] => {
  if (hasPersistedStaffRoster(team)) return [...(team.tycoon?.staffMembers ?? [])];
  const teamName = String(team.name ?? '');
  const teamFullName = getTeamFullName(team as any);
  const sameTeam = (member: StaffMember) => member.team === teamName || member.team === teamFullName;
  const headCoach = state.staff?.coaches?.find(member => sameTeam(member) && staffRole(member) === 'Head Coach');
  const gm = state.staff?.gms?.find(sameTeam);
  const realAssistants = getTeamStaff(teamName)
    .concat(teamFullName !== teamName ? getTeamStaff(teamFullName) : [])
    .filter(member => /^(lead )?assistant coach$/i.test(String(member.position ?? '')))
    .slice(0, 3)
    .map((member, index) => ({
      ...member,
      role: index === 0 ? 'Assistant Coach' : `Assistant Coach ${index + 1}`,
    } as StaffMember));
  const fallback: StaffMember[] = [
    ...(headCoach ? [headCoach] : []),
    ...realAssistants,
    ...(gm ? [{ ...gm, role: 'Chief Scout' } as StaffMember] : []),
  ];
  return fallback.map(member => {
    if (member.contractYears != null || (member as StaffMember & { contractExp?: number }).contractExp != null) return member;
    const contract = getCoachContractSnapshot(member.name, currentYear);
    return contract?.yearsLeft != null ? { ...member, contractYears: contract.yearsLeft } : member;
  });
};

export function projectStaffHiringRequirements(state: GameState): StaffHiringRequirements | null {
  const rules = getRules(state);
  if (rules.enabled === false) return null;
  const team = getManagedTeam(state);
  if (!team) return null;
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  const cycleSeason = Number(lifecycle.offseasonCycle ?? lifecycle.completedSeason ?? lifecycle.activeSeason);
  const currentYear = Number(state.leagueStats?.year ?? lifecycle.nextSeason);
  const evaluatedAtDate = String(state.date ?? '');
  const rawMembers = effectiveLegacyMembers(state, team, currentYear);
  const activeMembers = getActiveTeamStaffMembers({ ...team, tycoon: { ...team.tycoon, staffMembers: rawMembers } }, currentYear);
  const activeByRole = new Map<string, StaffMember>();
  for (const member of activeMembers) {
    const role = staffRole(member);
    if (role && !activeByRole.has(role)) activeByRole.set(role, member);
  }

  const requiredRoleKeys = uniqueSorted(
    (rules.requiredRoleKeys?.length ? rules.requiredRoleKeys : [...STANDARD_REQUIRED_STAFF_ROLE_KEYS])
      .map(canonicalStaffSlotRole),
  );
  const optionalRoleKeys = new Set(uniqueSorted((rules.optionalRoleKeys ?? []).map(canonicalStaffSlotRole)));
  const effectiveRequiredRoleKeys = requiredRoleKeys.filter(role => !optionalRoleKeys.has(role));
  const firedRoles = new Set(uniqueSorted((team.tycoon?.firedStaffRoles ?? []).map(canonicalStaffSlotRole)));
  const expiredByRole = new Map<string, StaffMember>();
  const expiringMembers: StaffMember[] = [];
  for (const member of rawMembers) {
    const role = staffRole(member);
    if (!role || member.retiredYear != null || member.diedYear != null) continue;
    if (!isActiveStaffContract(member, currentYear)) {
      expiringMembers.push(member);
      if (!expiredByRole.has(role)) expiredByRole.set(role, member);
    }
  }

  const teamId = Number(team.id ?? team.tid);
  const retirements = (state.staffRetirementAnnouncements ?? []).filter(record => (
    Number(record.season) === cycleSeason
    && (!Number.isFinite(teamId) || Number(record.teamId) === teamId)
  ));
  const retirementByRole = new Map<string, typeof retirements[number]>();
  for (const record of retirements) {
    const role = canonicalStaffSlotRole(record.role);
    if (role && !retirementByRole.has(role)) retirementByRole.set(role, record);
  }

  const requiredVacancies = effectiveRequiredRoleKeys
    .filter(roleKey => !activeByRole.has(roleKey))
    .map(roleKey => {
      const retirement = retirementByRole.get(roleKey);
      const expired = expiredByRole.get(roleKey);
      const previousStaffId = String(retirement?.staffId ?? staffId(expired) ?? '').trim() || undefined;
      const reason: StaffHiringVacancyReason = retirement
        ? 'retirement'
        : expired
          ? 'contract_expired'
          : firedRoles.has(roleKey)
            ? 'termination'
            : 'required_role_empty';
      return { roleKey, ...(previousStaffId ? { previousStaffId } : {}), reason };
    });
  const optionalVacancies = [...optionalRoleKeys]
    .filter(roleKey => !activeByRole.has(roleKey))
    .sort()
    .map(roleKey => ({ roleKey, reason: 'optional_role_empty' }));
  const expiringStaffIds = uniqueSorted(expiringMembers.map(member => staffId(member)));
  const retiredStaffIds = uniqueSorted(retirements.map(record => record.staffId ?? record.id));
  const unresolvedDecisionIds = [...expiringStaffIds];
  const filledRequiredRoleKeys = effectiveRequiredRoleKeys.filter(roleKey => activeByRole.has(roleKey)).sort();
  const fingerprintPayload = {
    cycleSeason,
    teamId,
    expiringStaffIds,
    retiredStaffIds,
    requiredVacancies,
    optionalVacancies,
    unresolvedDecisionIds,
    filledRequiredRoleKeys,
  };
  return {
    cycleSeason,
    evaluatedAtDate,
    expiringStaffIds,
    retiredStaffIds,
    requiredVacancies,
    optionalVacancies,
    unresolvedDecisionIds,
    filledRequiredRoleKeys,
    actionRequired: requiredVacancies.length > 0 || unresolvedDecisionIds.length > 0,
    evidenceFingerprint: stableFingerprint(fingerprintPayload),
  };
}

export function findCurrentStaffHiresReviewEvidence(
  state: GameState,
  requirements: StaffHiringRequirements,
): StaffHiresReviewEvidence | undefined {
  return state.staffHiresReviewEvidence?.find(evidence => (
    evidence.cycleSeason === requirements.cycleSeason
    && evidence.requirementsFingerprint === requirements.evidenceFingerprint
  ));
}

export function getStaffHiresTaskPhase(
  state: GameState,
  requirements = projectStaffHiringRequirements(state),
): StaffHiresTaskPhase {
  if (!terminal(state.offseasonChecklist?.staffRetirements)) return 'LOCKED';
  if (!requirements) return 'REQUIREMENTS_EVALUATED';
  if (findCurrentStaffHiresReviewEvidence(state, requirements)
    && terminal(state.offseasonChecklist?.staffSignings)) return 'COMPLETE';
  if (requirements.actionRequired) return 'ACTION_REQUIRED';
  if (state.offseasonChecklist?.staffSignings === 'in-progress') return 'REVIEW_READY';
  return 'NO_ACTION_REVIEW_READY';
}

export function completeStaffHiresReview(
  state: GameState,
  options: {
    reviewedBy: StaffHiresReviewEvidence['reviewedBy'];
    delegated?: boolean;
    requiredActionsCompleted?: boolean;
  },
): GameState {
  const requirements = projectStaffHiringRequirements(state);
  if (!terminal(state.offseasonChecklist?.staffRetirements)) {
    return { ...state, lastOutcome: 'Complete Staff Retirements before reviewing Staff Hires.' };
  }
  if (!requirements) return state;
  if (requirements.actionRequired) {
    const roles = requirements.requiredVacancies.map(vacancy => vacancy.roleKey);
    const roleCopy = roles.length > 0 ? roles.join(', ') : `${requirements.unresolvedDecisionIds.length} staff decision${requirements.unresolvedDecisionIds.length === 1 ? '' : 's'}`;
    return { ...state, lastOutcome: `Finish Staff Hires before continuing: ${roleCopy}.` };
  }
  const delegated = options.delegated === true;
  const actionsCompleted = options.requiredActionsCompleted === true;
  const evidence: StaffHiresReviewEvidence = {
    cycleSeason: requirements.cycleSeason,
    requirementsFingerprint: requirements.evidenceFingerprint,
    disposition: delegated
      ? actionsCompleted ? 'delegated_actions_completed' : 'delegated_no_action'
      : actionsCompleted ? 'required_actions_completed' : 'no_action_required',
    expiringStaffCount: requirements.expiringStaffIds.length,
    requiredVacancyCount: requirements.requiredVacancies.length,
    unresolvedDecisionCount: requirements.unresolvedDecisionIds.length,
    reviewedAtDate: String(state.date ?? requirements.evaluatedAtDate),
    reviewedBy: options.reviewedBy,
  };
  const previous = state.staffHiresReviewEvidence ?? [];
  const duplicate = previous.some(row => (
    row.cycleSeason === evidence.cycleSeason
    && row.requirementsFingerprint === evidence.requirementsFingerprint
  ));
  const summary = actionsCompleted ? 'Required staff actions complete' : 'No hires required';
  return {
    ...state,
    staffHiresReviewEvidence: duplicate ? previous : [...previous, evidence],
    offseasonChecklist: state.offseasonChecklist
      ? { ...state.offseasonChecklist, staffSignings: 'done' }
      : state.offseasonChecklist,
    lastOutcome: `Staff Hires complete — ${summary.toLowerCase()}.`,
  };
}

export function getStaffHiresCompletionSummary(state: GameState): string | null {
  const requirements = projectStaffHiringRequirements(state);
  if (!requirements) return null;
  const evidence = findCurrentStaffHiresReviewEvidence(state, requirements);
  if (!evidence) return null;
  return evidence.disposition === 'no_action_required' || evidence.disposition === 'delegated_no_action'
    ? 'No hires required'
    : 'Required staff actions complete';
}

export function getStaffHiresTrainingBlocker(state: GameState): StaffHiresTrainingBlocker | null {
  const status = state.offseasonChecklist?.staffSignings;
  const requirements = projectStaffHiringRequirements(state);
  if (!requirements) return null;
  const hasCurrentEvidence = !!findCurrentStaffHiresReviewEvidence(state, requirements);
  if (terminal(status) && (!requirements.actionRequired || hasCurrentEvidence)) return null;
  if (requirements.actionRequired) {
    return {
      code: 'STAFF_HIRES_IN_PROGRESS',
      label: 'Staff Hires in progress',
      subtext: 'Fill or delegate all required staff vacancies before running Training Camp.',
    };
  }
  if (status === 'in-progress') {
    return {
      code: 'STAFF_HIRING_REVIEW_READY',
      label: 'Staff hiring review ready',
      subtext: 'All required staff actions are complete. Review and mark the Staff Hires task done to continue.',
    };
  }
  return {
    code: 'STAFF_HIRES_REVIEW_REQUIRED',
    label: 'Staff Hires review required',
    subtext: 'No staff hiring action is required, but the Staff Hires review must be acknowledged before Training Camp.',
  };
}
