import type {
  ContinentalAgreement,
  EuroDomesticTransitionReview,
  EuroLeagueAssemblyClub,
  EuroLeagueAssemblyCompetition,
  EuroLicensingReview,
  GameState,
  GovernorsBoardMeeting,
} from '../../types';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { getRelevantEuroCompetitions } from '../../utils/euroLeagueDefaults';
import type { EuroleagueCandidateEvaluation } from '../../utils/euroleagueQualification';
import {
  declineEuroleagueInvitationAgreements,
  getAgreementLabel,
  getAgreementStatus,
} from './continentalAgreements';

function teamId(team: any): number {
  return Number(team?.id ?? team?.tid);
}

function uniqueTids(tids: number[]): number[] {
  return [...new Set(tids.filter(tid => Number.isFinite(tid) && tid >= 0))];
}

function scheduledParticipants(state: GameState, competitionId: string): number[] {
  return uniqueTids(state.schedule
    .filter(game => game.competitionId === competitionId)
    .flatMap(game => [game.homeTid, game.awayTid]));
}

export function buildEuroLeagueAssemblyMeeting(
  state: GameState,
  nextMemberships: Record<string, number[]>,
  season: number,
  reviewInput?: {
    agreements?: ContinentalAgreement[];
    candidateEvaluations?: EuroleagueCandidateEvaluation[];
    domesticTransition?: { competitionId: string; previousTids: number[]; nextTids: number[] };
  },
): GovernorsBoardMeeting {
  const clubsById = new Map<number, any>();
  for (const club of [...state.teams, ...state.nonNBATeams]) clubsById.set(teamId(club), club);
  const competitionById = new Map((state.activeCompetitions ?? []).map(competition => [competition.id, competition]));
  const relevantCompetitionIds = new Set(getRelevantEuroCompetitions({
    ...state,
    euroCompetitionTeamTids: nextMemberships,
  }).map(competition => competition.id));
  const ids = [...new Set([
    ...Object.keys(state.euroCompetitionTeamTids ?? {}),
    ...Object.keys(nextMemberships),
    ...(state.activeCompetitions ?? []).map(competition => competition.id),
  ])].filter(id => !id.startsWith('pba-') && relevantCompetitionIds.has(id));

  const clubRow = (tid: number): EuroLeagueAssemblyClub => {
    const club = clubsById.get(tid);
    return {
      teamId: tid,
      name: club ? getTeamFullName(club) : `Club ${tid}`,
      abbrev: club?.abbrev,
      logoUrl: club ? getResolvedTeamLogoUrl(club, season) || undefined : undefined,
    };
  };

  const previousEuroleagueTids = uniqueTids(
    state.euroCompetitionTeamTids?.euroleague
    ?? scheduledParticipants(state, 'euroleague'),
  );
  const previousEurocupTids = uniqueTids(
    state.euroCompetitionTeamTids?.eurocup
    ?? scheduledParticipants(state, 'eurocup'),
  );
  const agreements = reviewInput?.agreements ?? state.continentalAgreements ?? [];
  const reviewClubs = previousEuroleagueTids.map(tid => {
    const agreement = agreements
      .filter(row => row.competitionId === 'euroleague' && row.clubId === tid && row.startSeason < season)
      .sort((left, right) => right.startSeason - left.startSeason)[0]
      ?? {
        competitionId: 'euroleague' as const,
        clubId: tid,
        agreementType: 'oneYearWildcard' as const,
        startSeason: season - 1,
        endSeason: season - 1,
        status: 'expired' as const,
        source: 'save-review' as const,
      };
    const status = getAgreementStatus(agreement, season);
    return {
      ...clubRow(tid),
      agreementType: agreement.agreementType,
      agreementStatus: status,
      agreementLabel: getAgreementLabel(agreement.agreementType),
      yearsRemaining: agreement.endSeason == null ? undefined : Math.max(0, agreement.endSeason - season + 1),
      expirationSeason: agreement.endSeason,
    };
  });
  const candidateEvaluations = reviewInput?.candidateEvaluations ?? [];
  const reviewCandidates = candidateEvaluations.map(candidate => ({
    ...clubRow(candidate.tid),
    teamId: candidate.tid,
    performance: candidate.performance,
    continentalStanding: candidate.continentalStanding,
    clubStanding: candidate.clubStanding,
    continuity: candidate.continuity,
    totalScore: candidate.totalScore,
    selected: candidate.selected,
    incumbent: candidate.incumbent,
  }));
  const userCandidate = reviewCandidates.find(candidate => candidate.teamId === state.userTeamId && candidate.selected);
  const userPreviousAgreement = reviewClubs.find(club => club.teamId === state.userTeamId);
  const userInvitationTeamId = userCandidate
    && (!previousEuroleagueTids.includes(userCandidate.teamId) || userPreviousAgreement?.agreementStatus === 'expired')
    ? userCandidate.teamId
    : undefined;
  let domesticTransition: EuroDomesticTransitionReview | undefined;
  if (reviewInput?.domesticTransition) {
    const spec = competitionById.get(reviewInput.domesticTransition.competitionId);
    const previous = uniqueTids(reviewInput.domesticTransition.previousTids);
    const next = uniqueTids(reviewInput.domesticTransition.nextTids);
    const previousSet = new Set(previous);
    const nextSet = new Set(next);
    domesticTransition = {
      competitionId: reviewInput.domesticTransition.competitionId,
      competitionName: spec?.displayName ?? reviewInput.domesticTransition.competitionId,
      previousParticipants: previous.map(clubRow),
      relegated: previous.filter(tid => !nextSet.has(tid)).map(clubRow),
      promoted: next.filter(tid => !previousSet.has(tid)).map(clubRow),
      nextParticipants: next.map(clubRow),
    };
  }
  const hasDomesticMovements = !!domesticTransition
    && (domesticTransition.relegated.length > 0 || domesticTransition.promoted.length > 0);
  const licensingReview: EuroLicensingReview | undefined = reviewInput
    && (previousEuroleagueTids.length > 0 || hasDomesticMovements)
    ? {
        season,
        status: 'pending',
        previousEuroleagueTids,
        previousEurocupTids,
        proposedEuroleagueTids: uniqueTids(nextMemberships.euroleague ?? previousEuroleagueTids),
        proposedEurocupTids: uniqueTids(nextMemberships.eurocup ?? previousEurocupTids),
        clubs: reviewClubs,
        candidates: reviewCandidates,
        userInvitationTeamId,
        alternateTeamId: reviewCandidates.find(candidate => !candidate.selected)?.teamId,
        domesticTransition,
      }
    : undefined;

  const competitionChanges: EuroLeagueAssemblyCompetition[] = ids.map(competitionId => {
    const previous = uniqueTids(
      state.euroCompetitionTeamTids?.[competitionId]
      ?? scheduledParticipants(state, competitionId),
    );
    const participants = uniqueTids(nextMemberships[competitionId] ?? previous);
    const previousSet = new Set(previous);
    const nextSet = new Set(participants);
    const spec = competitionById.get(competitionId);
    return {
      competitionId,
      competitionName: spec?.displayName ?? competitionId,
      participants: participants.map(clubRow),
      entering: participants.filter(tid => !previousSet.has(tid)).map(clubRow),
      leaving: previous.filter(tid => !nextSet.has(tid)).map(clubRow),
    };
  }).filter(change => change.participants.length > 0)
    .sort((left, right) => {
      const rank = (id: string) => id === state.euroPrimaryCompetitionId ? 0 : id === 'euroleague' ? 1 : 2;
      return rank(left.competitionId) - rank(right.competitionId)
        || left.competitionName.localeCompare(right.competitionName);
    });

  return {
    kind: 'euro-league-assembly',
    season,
    generatedAt: state.date,
    ruleChanges: [],
    teamChanges: [],
    majorUpdates: competitionChanges.map(change => ({
      key: `competition:${change.competitionId}`,
      title: change.competitionName,
      summary: `${change.participants.length} clubs confirmed${change.entering.length > 0 ? `, ${change.entering.length} entering` : ''}${change.leaving.length > 0 ? `, ${change.leaving.length} leaving` : ''}.`,
    })),
    competitionChanges,
    licensingReview,
  };
}

export function rebuildEuroLeagueAssemblyMeetingWithDomesticTransition(
  state: GameState,
  nextMemberships: Record<string, number[]>,
  season: number,
  domesticTransition: { competitionId: string; previousTids: number[]; nextTids: number[] },
): GovernorsBoardMeeting {
  const rebuilt = buildEuroLeagueAssemblyMeeting(state, nextMemberships, season, { domesticTransition });
  const existing = state.pendingGovernorsBoardMeeting;
  if (
    existing?.kind !== 'euro-league-assembly'
    || existing.season !== season
    || !existing.licensingReview
    || !rebuilt.licensingReview?.domesticTransition
  ) return rebuilt;
  return {
    ...rebuilt,
    licensingReview: {
      ...existing.licensingReview,
      domesticTransition: rebuilt.licensingReview.domesticTransition,
    },
  };
}

export function applyEuroLicensingReviewDecision(
  state: GameState,
  decision: 'accept' | 'decline' | 'observe',
): Partial<GameState> {
  const meeting = state.pendingGovernorsBoardMeeting;
  const review = meeting?.licensingReview;
  if (!meeting || !review || review.status !== 'pending') return {};
  if (decision !== 'decline' || review.userInvitationTeamId == null) {
    return {
      pendingGovernorsBoardMeeting: {
        ...meeting,
        licensingReview: {
          ...review,
          status: decision === 'accept' ? 'accepted' : 'observed',
        },
      },
    };
  }

  const declinedClubId = review.userInvitationTeamId;
  const alternateClubId = review.alternateTeamId ?? null;
  const euroleague = uniqueTids([
    ...review.proposedEuroleagueTids.filter(tid => tid !== declinedClubId),
    ...(alternateClubId != null ? [alternateClubId] : []),
  ]);
  const previousEurocupSet = new Set(review.previousEurocupTids);
  let eurocup = review.proposedEurocupTids.filter(tid => tid !== alternateClubId);
  if (previousEurocupSet.has(declinedClubId) && !eurocup.includes(declinedClubId)) eurocup.push(declinedClubId);
  const targetEurocupCount = review.proposedEurocupTids.length;
  if (eurocup.length > targetEurocupCount) {
    eurocup = [
      ...eurocup.filter(tid => tid === declinedClubId),
      ...eurocup.filter(tid => tid !== declinedClubId),
    ].slice(0, targetEurocupCount);
  }
  const memberships = {
    ...(state.euroCompetitionTeamTids ?? {}),
    euroleague,
    eurocup,
  };
  const continentalAgreements = declineEuroleagueInvitationAgreements(
    state.continentalAgreements ?? [],
    review.season,
    declinedClubId,
    alternateClubId,
    previousEurocupSet.has(declinedClubId),
  );
  const rebuilt = buildEuroLeagueAssemblyMeeting(
    { ...state, continentalAgreements },
    memberships,
    review.season,
  );
  rebuilt.licensingReview = {
    ...review,
    status: 'declined',
    proposedEuroleagueTids: euroleague,
    proposedEurocupTids: eurocup,
    candidates: review.candidates.map(candidate => ({
      ...candidate,
      selected: candidate.teamId === declinedClubId ? false : alternateClubId != null && candidate.teamId === alternateClubId ? true : candidate.selected,
    })),
  };
  return {
    euroCompetitionTeamTids: memberships,
    continentalAgreements,
    pendingGovernorsBoardMeeting: rebuilt,
    pendingEuroleagueWelcome: undefined,
  };
}
