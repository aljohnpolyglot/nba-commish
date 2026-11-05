import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { EuroLeagueAssemblyClub, EuroLicensingReview, GameState } from '../../../types';
import { getAgreementLabel, getClubAgreement } from '../../../services/euro/continentalAgreements';
import { EuroLeagueView } from './EuroLeagueView';
import { LigaEndesaView } from './LigaEndesaView';
import { StepProgressNav } from './StepProgressNav';
import type { Candidate, EuroLeagueStep, LeagueMode, LigaEndesaStep, Team } from './types';

type Props = {
  review: EuroLicensingReview;
  state: GameState;
  onDecision: (decision: 'accept' | 'decline' | 'observe') => Promise<void> | void;
  onFinished: () => void;
};

const euroLeagueSteps = [
  { id: 1, label: 'Roster Review' },
  { id: 2, label: 'Open Places' },
  { id: 3, label: 'Club Review' },
  { id: 4, label: 'Invitation' },
];

const domesticSteps = [
  { id: 1, label: 'Standings' },
  { id: 2, label: 'Relegation' },
  { id: 3, label: 'Promotion' },
  { id: 4, label: 'Next Season' },
];

function statusType(status: string, longTerm = false): Team['statusType'] {
  if (longTerm) return 'long-term';
  if (status === 'expired' || status === 'terminated') return 'expired';
  if (status === 'expiring') return 'expiring';
  return 'active';
}

const seasonLabel = (season: number) => `${season}–${String(season + 1).slice(-2)}`;

export function EuropeanLicensingReview({ review, state, onDecision, onFinished }: Props) {
  const hasDomesticTransition = !!review.domesticTransition
    && (review.domesticTransition.promoted.length > 0 || review.domesticTransition.relegated.length > 0);
  const hasEuroleagueReview = review.previousEuroleagueTids.length > 0
    || review.proposedEuroleagueTids.length > 0
    || review.candidates.length > 0;
  const [mode, setMode] = useState<LeagueMode>(hasDomesticTransition ? 'liga_endesa' : 'euroleague');
  const [currentStep, setCurrentStep] = useState(1);

  const clubsById = useMemo(() => {
    const clubs: EuroLeagueAssemblyClub[] = [
      ...review.clubs,
      ...review.candidates,
      ...(review.domesticTransition?.previousParticipants ?? []),
      ...(review.domesticTransition?.nextParticipants ?? []),
    ];
    return new Map<number, EuroLeagueAssemblyClub>(clubs.map(club => [club.teamId, club] as const));
  }, [review]);

  const previousEuroleagueTeams: Team[] = review.clubs.map(club => ({
    id: club.teamId,
    name: club.name,
    logoUrl: club.logoUrl,
    status: club.agreementStatus === 'expired'
      ? 'EXPIRED'
      : club.agreementStatus === 'expiring'
        ? `${Math.max(1, club.yearsRemaining ?? 1)} YEAR LEFT`
        : club.agreementType === 'longTermLicense'
          ? 'LONG-TERM'
          : club.agreementLabel.toUpperCase(),
    statusType: statusType(club.agreementStatus, club.agreementType === 'longTermLicense'),
  }));

  const finalEuroleagueTeams: Team[] = review.proposedEuroleagueTids.map(teamId => {
    const club = clubsById.get(teamId);
    const agreement = getClubAgreement(state.continentalAgreements ?? [], 'euroleague', teamId, review.season);
    return {
      id: teamId,
      name: club?.name ?? `Club ${teamId}`,
      logoUrl: club?.logoUrl,
      status: agreement ? getAgreementLabel(agreement.agreementType).toUpperCase() : 'CONFIRMED',
      statusType: statusType(agreement?.status ?? 'active', agreement?.agreementType === 'longTermLicense'),
    };
  });

  const candidates: Candidate[] = review.candidates.map(candidate => ({
    id: candidate.teamId,
    name: candidate.name,
    logoUrl: candidate.logoUrl,
    performance: candidate.performance,
    continentalStanding: candidate.continentalStanding,
    clubStanding: candidate.clubStanding,
    continuity: candidate.continuity,
    totalScore: candidate.totalScore,
    isSelected: candidate.selected,
    incumbent: candidate.incumbent,
  }));

  const domestic = review.domesticTransition;
  const relegatedIds = new Set(domestic?.relegated.map(club => club.teamId) ?? []);
  const promotedIds = new Set(domestic?.promoted.map(club => club.teamId) ?? []);
  const previousDomesticTeams: Team[] = (domestic?.previousParticipants ?? []).map((club, index) => ({
    id: club.teamId,
    name: club.name,
    logoUrl: club.logoUrl,
    rank: index + 1,
    status: relegatedIds.has(club.teamId) ? 'RELEGATION' : 'SAFE',
    statusType: relegatedIds.has(club.teamId) ? 'relegated' : 'safe',
  }));
  const nextDomesticTeams: Team[] = (domestic?.nextParticipants ?? []).map((club, index) => ({
    id: club.teamId,
    name: club.name,
    logoUrl: club.logoUrl,
    rank: index + 1,
    status: promotedIds.has(club.teamId) ? 'PROMOTED' : 'CONFIRMED',
    statusType: promotedIds.has(club.teamId) ? 'promoted' : 'safe',
  }));
  const relegatedTeams = previousDomesticTeams.filter(team => relegatedIds.has(team.id));
  const promotedTeams = nextDomesticTeams.filter(team => promotedIds.has(team.id));
  const invitationAgreement = review.userInvitationTeamId == null
    ? null
    : getClubAgreement(state.continentalAgreements ?? [], 'euroleague', review.userInvitationTeamId, review.season);

  const finishReview = useCallback(async () => {
    if (review.status === 'pending') await onDecision('observe');
    onFinished();
  }, [onDecision, onFinished, review.status]);

  const advance = useCallback(() => {
    if (currentStep < 4) {
      setCurrentStep(step => step + 1);
      return;
    }
    if (mode === 'liga_endesa') {
      if (!hasEuroleagueReview) {
        void finishReview();
        return;
      }
      setMode('euroleague');
      setCurrentStep(1);
      return;
    }
    void finishReview();
  }, [currentStep, finishReview, hasEuroleagueReview, mode]);

  const back = () => {
    if (currentStep > 1) {
      setCurrentStep(step => step - 1);
      return;
    }
    if (mode === 'euroleague' && hasDomesticTransition) {
      setMode('liga_endesa');
      setCurrentStep(4);
    }
  };

  const skipAnimations = async () => {
    if (hasEuroleagueReview && review.status === 'pending' && review.userInvitationTeamId != null) {
      setMode('euroleague');
      setCurrentStep(4);
      return;
    }
    await finishReview();
  };

  const invitationPending = review.status === 'pending' && review.userInvitationTeamId != null;
  const activeSteps = mode === 'euroleague' ? euroLeagueSteps : domesticSteps;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/90 p-1 backdrop-blur-md sm:p-3">
      <div className="relative flex h-[98vh] min-h-[560px] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#07111e] shadow-[0_30px_120px_rgba(0,0,0,0.78)] sm:h-[94vh] sm:rounded-3xl">
        {!invitationPending && <button onClick={() => void skipAnimations()} aria-label="Continue to league assembly" className="absolute right-3 top-3 z-[70] rounded-full border border-white/10 bg-white/5 p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white sm:right-5 sm:top-5"><X size={19} /></button>}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8">
          <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col items-center justify-center">
            <div className="mb-6 text-center sm:mb-8">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">European Basketball · {seasonLabel(review.season)}</p>
              <h1 className="mt-2 bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-2xl font-black tracking-wide text-transparent sm:text-3xl">{mode === 'euroleague' ? 'EUROLEAGUE LICENSING' : `${domestic?.competitionName?.toUpperCase() ?? 'DOMESTIC LEAGUE'} TRANSITION`}</h1>
            </div>
            {mode === 'euroleague' ? <EuroLeagueView
              step={currentStep as EuroLeagueStep}
              teams={previousEuroleagueTeams}
              finalTeams={finalEuroleagueTeams}
              candidates={candidates}
              season={review.season}
              userTeamId={state.userTeamId}
              invitationTeamId={invitationPending ? review.userInvitationTeamId : undefined}
              invitationAgreement={invitationAgreement ? getAgreementLabel(invitationAgreement.agreementType) : undefined}
              invitationValidThrough={invitationAgreement?.endSeason != null ? `Valid through ${seasonLabel(invitationAgreement.endSeason)}` : 'Long-term participation'}
              onAccept={() => onDecision('accept')}
              onDecline={() => onDecision('decline')}
              onComplete={advance}
            /> : <LigaEndesaView
              step={currentStep as LigaEndesaStep}
              competitionName={domestic?.competitionName ?? 'Domestic League'}
              previousTeams={previousDomesticTeams}
              nextTeams={nextDomesticTeams}
              relegatedTeams={relegatedTeams}
              promotedTeams={promotedTeams}
              season={review.season}
              userTeamId={state.userTeamId}
              onComplete={advance}
            />}
          </main>
        </div>
        <div className="z-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 bg-[#06101b] p-3 sm:flex-row sm:p-4 md:px-6">
          <button onClick={back} disabled={currentStep === 1 && (mode === 'liga_endesa' || !hasDomesticTransition)} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto"><ChevronLeft className="h-4 w-4" />Prev</button>
          <div className="w-full max-w-2xl"><StepProgressNav steps={activeSteps} currentStep={currentStep} onSelectStep={setCurrentStep} /></div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button onClick={() => void skipAnimations()} className="min-h-11 flex-1 rounded-xl border border-slate-600/70 bg-slate-800/60 px-3 text-xs font-black uppercase tracking-wide text-slate-300 hover:bg-slate-700/70 sm:flex-none">Skip animations</button>
            <button onClick={advance} disabled={invitationPending && mode === 'euroleague' && currentStep === 4} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-600/20 px-4 py-2 text-sm font-semibold text-orange-300 transition-all hover:bg-orange-600/30 disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none">Next<ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
