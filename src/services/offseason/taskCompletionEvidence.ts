import type { GameState, TeamStatus } from '../../types';
import { normalizeDate } from '../../utils/helpers';
import {
  ensureFranchiseOperations,
  getFranchiseTaskItems,
  isFranchiseExperienceAvailable,
  resolveActiveLeagueFranchiseDeals,
} from '../franchises/franchiseState';
import { resolveLeagueSeasonLifecycle } from '../lifecycle/leagueSeasonLifecycle';
import { setRowStatus } from './offseasonState';

export interface MediaDayReviewEvidence {
  cycleSeason: number;
  teamId: number;
  answer: TeamStatus;
  answeredAtDate: string;
  answeredBy: 'user' | 'assistant_gm' | 'commissioner_auto';
  evidenceFingerprint: string;
}

export interface FranchiseDealsRequirements {
  cycleSeason: number;
  teamId: number;
  evaluatedAtDate: string;
  requiredItems: string[];
  evidenceFingerprint: string;
}

export interface FranchiseDealsReviewEvidence {
  cycleSeason: number;
  teamId: number;
  requirementsFingerprint: string;
  disposition: 'already_covered' | 'required_deals_completed' | 'delegated_complete';
  completedAtDate: string;
  completedBy: 'system_evidence' | 'user' | 'assistant_gm' | 'commissioner_auto';
  summary: string;
}

const exactCycle = (state: GameState): number => {
  const lifecycle = resolveLeagueSeasonLifecycle(state);
  return Number(lifecycle.offseasonCycle ?? lifecycle.completedSeason ?? lifecycle.activeSeason);
};

const stableFingerprint = (namespace: string, value: unknown): string => {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${namespace}-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const managedTeam = (state: GameState) => {
  const teamId = Number(state.userTeamId);
  if (!Number.isFinite(teamId)) return undefined;
  return [...(state.teams ?? []), ...(state.nonNBATeams ?? [])]
    .find(team => Number((team as { id?: number; tid?: number }).id ?? (team as { tid?: number }).tid) === teamId);
};

export function findCurrentMediaDayEvidence(state: GameState): MediaDayReviewEvidence | undefined {
  const team = managedTeam(state);
  if (!team) return undefined;
  const teamId = Number((team as { id?: number; tid?: number }).id ?? (team as { tid?: number }).tid);
  const answer = (team as { manualTeamStatus?: TeamStatus }).manualTeamStatus;
  return state.mediaDayReviewEvidence?.find(evidence => (
    evidence.cycleSeason === exactCycle(state)
    && evidence.teamId === teamId
    && evidence.answer === answer
    && evidence.evidenceFingerprint === stableFingerprint('media-day', {
      cycleSeason: evidence.cycleSeason,
      teamId,
      answer,
    })
  ));
}

export function completeMediaDayAnswer(
  state: GameState,
  answer: TeamStatus,
  answeredBy: MediaDayReviewEvidence['answeredBy'] = 'user',
): GameState {
  const team = managedTeam(state);
  if (!team) return state;
  const teamId = Number((team as { id?: number; tid?: number }).id ?? (team as { tid?: number }).tid);
  const cycleSeason = exactCycle(state);
  const evidence: MediaDayReviewEvidence = {
    cycleSeason,
    teamId,
    answer,
    answeredAtDate: normalizeDate(state.date),
    answeredBy,
    evidenceFingerprint: stableFingerprint('media-day', { cycleSeason, teamId, answer }),
  };
  const patchTeam = <T extends { id?: number; tid?: number }>(candidate: T): T => (
    Number(candidate.id ?? candidate.tid) === teamId
      ? { ...candidate, manualTeamStatus: answer }
      : candidate
  );
  const previous = state.mediaDayReviewEvidence ?? [];
  const evidenceRows = previous.some(row => row.evidenceFingerprint === evidence.evidenceFingerprint)
    ? previous
    : [...previous, evidence];
  return {
    ...state,
    teams: state.teams.map(patchTeam),
    nonNBATeams: (state.nonNBATeams ?? []).map(patchTeam),
    mediaDayReviewEvidence: evidenceRows,
    offseasonChecklist: setRowStatus(state.offseasonChecklist, 'strategyReview', 'done'),
    lastOutcome: 'Media Day is complete. Your season expectations are saved.',
  };
}

export function projectFranchiseDealsRequirements(state: GameState): FranchiseDealsRequirements | null {
  if (!isFranchiseExperienceAvailable(state)) return null;
  const team = managedTeam(state);
  if (!team || !('id' in team)) return null;
  const teamId = Number((team as { id?: number; tid?: number }).id ?? (team as { tid?: number }).tid);
  const cycleSeason = exactCycle(state);
  const requiredItems = getFranchiseTaskItems(
    ensureFranchiseOperations(state, team as GameState['teams'][number]),
    state.leagueStats,
  ).sort();
  return {
    cycleSeason,
    teamId,
    evaluatedAtDate: normalizeDate(state.date),
    requiredItems,
    evidenceFingerprint: stableFingerprint('franchise-deals', {
      cycleSeason,
      teamId,
      requiredItems,
    }),
  };
}

export function findCurrentFranchiseDealsEvidence(
  state: GameState,
  requirements = projectFranchiseDealsRequirements(state),
): FranchiseDealsReviewEvidence | undefined {
  if (!requirements) return undefined;
  return state.franchiseDealsReviewEvidence?.find(evidence => (
    evidence.cycleSeason === requirements.cycleSeason
    && evidence.teamId === requirements.teamId
    && evidence.requirementsFingerprint === requirements.evidenceFingerprint
  ));
}

export function completeFranchiseDealsFromEvidence(
  state: GameState,
  options: {
    completedBy?: FranchiseDealsReviewEvidence['completedBy'];
    delegated?: boolean;
  } = {},
): GameState {
  const resolvedState = resolveActiveLeagueFranchiseDeals(state);
  const requirements = projectFranchiseDealsRequirements(resolvedState);
  if (!requirements || requirements.requiredItems.length > 0) return state;
  const existing = findCurrentFranchiseDealsEvidence(resolvedState, requirements);
  const evidence: FranchiseDealsReviewEvidence = existing ?? {
    cycleSeason: requirements.cycleSeason,
    teamId: requirements.teamId,
    requirementsFingerprint: requirements.evidenceFingerprint,
    disposition: options.delegated
      ? 'delegated_complete'
      : resolvedState.offseasonChecklist?.sponsorRenewals === 'in-progress'
        ? 'required_deals_completed'
        : 'already_covered',
    completedAtDate: normalizeDate(resolvedState.date),
    completedBy: options.completedBy ?? 'system_evidence',
    summary: 'All required franchise partnerships are under contract for next season.',
  };
  return {
    ...resolvedState,
    franchiseDealsReviewEvidence: existing
      ? resolvedState.franchiseDealsReviewEvidence
      : [...(resolvedState.franchiseDealsReviewEvidence ?? []), evidence],
    offseasonChecklist: setRowStatus(resolvedState.offseasonChecklist, 'sponsorRenewals', 'done'),
    lastOutcome: 'Franchise Deals complete — all required partnerships are covered.',
  };
}
