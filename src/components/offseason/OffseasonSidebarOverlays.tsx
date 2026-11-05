import React from 'react';
import type { LeagueStats, NBAPlayer } from '../../types';
import { TeamOptionGateModal } from '../modals/TeamOptionGateModal';
import { SponsorshipNegotiationModal } from '../tycoon/SponsorshipNegotiationModal';
import { FacilityReviewModal } from '../tycoon/FacilityReviewModal';
import { BudgetReviewModal } from '../tycoon/BudgetReviewModal';
import { PlayerProtectionModal } from '../expansion/PlayerProtectionModal';
import { ExpansionDraftView } from '../expansion/ExpansionDraftView';
import RetiredPlayersReviewModal from './views/RetiredPlayersReviewView';
import StaffRetirementsReviewModal from './views/StaffRetirementsReviewView';
import HOFCeremonyModal from './views/HOFCeremonyView';
import GovernorsBoardMeetingView from './views/GovernorsBoardMeetingView';
import PBAImportDecisionReviewView from './views/PBAImportDecisionReviewView';
import { QualifyingOfferModal } from './OffseasonSidebarBits';
import {
  OffseasonAutoResolveConfirmModal,
  OffseasonBriefingModal,
  OffseasonStepConfirmModal,
  PreseasonFriendliesModal,
  RookieContractsDisclaimerModal,
  YouthPromotionModal,
} from './OffseasonModalDeck';
import { ScheduleDrawModal } from './ScheduleDrawModal';
import { EuroPreseasonFriendliesScheduler } from './EuroPreseasonFriendliesScheduler';
import type { OffseasonFixtureRow } from './offseasonSidebarData';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamFullName } from '../../utils/teamNames';
import { getPlayerImage } from '../../utils/playerImage';
import type { OffseasonConfirmSpec } from './offseasonStepSpecs';
import { PbaMuseSelectionModal } from '../pba/PbaMuseSelectionModal';
import type { PbaMuseCandidate, PbaMuseSelection } from '../../services/pba/musePool';
import { PBAOpeningCeremonyView } from '../pba/PBAOpeningCeremonyView';
import { getEurostashEligibility } from '../../services/freeAgency/eurostashRights';

const EMPTY_MUSE_SELECTIONS: PbaMuseSelection[] = [];

type Props = {
  state: any;
  userTeam: any;
  retiredReviewOpen: boolean;
  staffRetirementsOpen: boolean;
  hofCeremonyOpen: boolean;
  governorsBoardOpen: boolean;
  sponsorModalOpen: boolean;
  facilityReviewOpen: boolean;
  budgetReviewOpen: boolean;
  optionsModalOpen: boolean;
  pendingTeamOptions: NBAPlayer[];
  exercisedIds: Set<string>;
  declinedIds: Set<string>;
  expiringGateModal: React.ReactNode;
  qoModalOpen: boolean;
  rfaCandidates: NBAPlayer[];
  qoSubmittedIds: Set<string>;
  qoSkippedIds: Set<string>;
  youthPromotionOpen: boolean;
  youthPlayers: Array<any>;
  seniorRosterSize: number;
  maxRosterSize: number;
  euroScheduleDrawOpen: boolean;
  euroScheduleGames: OffseasonFixtureRow[];
  preseasonFriendliesOpen: boolean;
  preseasonGames: OffseasonFixtureRow[];
  pbaImportDecisionOpen: boolean;
  pbaMuseSelectionOpen: boolean;
  pbaOpeningCeremonyOpen: boolean;
  stepConfirm: OffseasonConfirmSpec | null;
  briefingSpec: { eyebrow: string; title: string; body: string } | null;
  autoResolveConfirmOpen: boolean;
  rookieDisclaimerOpen: boolean;
  userTeamRookies: NBAPlayer[];
  expansionProtectOpen: boolean;
  expansionDraftViewOpen: boolean;
  onRetiredClose: () => void;
  onStaffRetirementsClose: () => void;
  onHofClose: () => void;
  onGovernorsBoardClose: () => void;
  onGovernorsBoardDone: () => void;
  onSponsorClose: () => void;
  onFacilityOpenSliders: () => void;
  onFacilityClose: () => void;
  onFacilityMarkDone: () => void;
  onBudgetClose: () => void;
  onBudgetMarkDone: () => void;
  onOptionsAssistant: () => Promise<void>;
  onOptionsManual: () => void;
  onOptionsDismiss: () => void;
  onOptionsExerciseOne: (playerId: string) => Promise<void>;
  onOptionsDeclineOne: (playerId: string) => Promise<void>;
  onQoSubmitOne: (playerId: string) => void;
  onQoSkipOne: (playerId: string) => void;
  onQoAssistant: () => void;
  onQoDismiss: () => void;
  onYouthClose: () => void;
  onYouthPromote: (ids: Array<string | number>) => void;
  onEuroScheduleClose: () => void;
  onEuroScheduleDone: () => void;
  onPreseasonClose: () => void;
  onPreseasonDone: () => void;
  onPreseasonScheduleChange: (schedule: any[]) => void;
  onPbaImportDecisionClose: () => void;
  onPbaImportDecisionDone: () => void;
  onPbaMuseSelectionClose: () => void;
  onPbaMuseChosen: (candidate: PbaMuseCandidate) => void;
  onPbaOpeningCeremonyExit: () => void;
  onPbaOpeningCeremonySkip: () => void;
  onStepCancel: () => void;
  onStepConfirm: () => void;
  onStepSecondary: () => void;
  onBriefingConfirm: () => void;
  onBriefingDismissForever: () => void;
  onAutoResolveCancel: () => void;
  onAutoResolveConfirm: () => void;
  onRookieDismiss: () => void;
  onRookieSelect: (player: NBAPlayer) => void;
  onExpansionProtectClose: () => void;
  onExpansionProtectConfirm: (protections: any) => Promise<void>;
  onExpansionDraftClose: () => void;
};

export const OffseasonSidebarOverlays: React.FC<Props> = ({
  state,
  userTeam,
  retiredReviewOpen,
  staffRetirementsOpen,
  hofCeremonyOpen,
  governorsBoardOpen,
  sponsorModalOpen,
  facilityReviewOpen,
  budgetReviewOpen,
  optionsModalOpen,
  pendingTeamOptions,
  exercisedIds,
  declinedIds,
  expiringGateModal,
  qoModalOpen,
  rfaCandidates,
  qoSubmittedIds,
  qoSkippedIds,
  youthPromotionOpen,
  youthPlayers,
  seniorRosterSize,
  maxRosterSize,
  euroScheduleDrawOpen,
  euroScheduleGames,
  preseasonFriendliesOpen,
  preseasonGames,
  pbaImportDecisionOpen,
  pbaMuseSelectionOpen,
  pbaOpeningCeremonyOpen,
  stepConfirm,
  briefingSpec,
  autoResolveConfirmOpen,
  rookieDisclaimerOpen,
  userTeamRookies,
  expansionProtectOpen,
  expansionDraftViewOpen,
  onRetiredClose,
  onStaffRetirementsClose,
  onHofClose,
  onGovernorsBoardClose,
  onGovernorsBoardDone,
  onSponsorClose,
  onFacilityOpenSliders,
  onFacilityClose,
  onFacilityMarkDone,
  onBudgetClose,
  onBudgetMarkDone,
  onOptionsAssistant,
  onOptionsManual,
  onOptionsDismiss,
  onOptionsExerciseOne,
  onOptionsDeclineOne,
  onQoSubmitOne,
  onQoSkipOne,
  onQoAssistant,
  onQoDismiss,
  onYouthClose,
  onYouthPromote,
  onEuroScheduleClose,
  onEuroScheduleDone,
  onPreseasonClose,
  onPreseasonDone,
  onPreseasonScheduleChange,
  onPbaImportDecisionClose,
  onPbaImportDecisionDone,
  onPbaMuseSelectionClose,
  onPbaMuseChosen,
  onPbaOpeningCeremonyExit,
  onPbaOpeningCeremonySkip,
  onStepCancel,
  onStepConfirm,
  onStepSecondary,
  onBriefingConfirm,
  onBriefingDismissForever,
  onAutoResolveCancel,
  onAutoResolveConfirm,
  onRookieDismiss,
  onRookieSelect,
  onExpansionProtectClose,
  onExpansionProtectConfirm,
  onExpansionDraftClose,
}) => (
  <>
    <RetiredPlayersReviewModal isOpen={retiredReviewOpen} onClose={onRetiredClose} />
    <StaffRetirementsReviewModal isOpen={staffRetirementsOpen} onClose={onStaffRetirementsClose} />
    <HOFCeremonyModal isOpen={hofCeremonyOpen} onClose={onHofClose} />
    <GovernorsBoardMeetingView isOpen={governorsBoardOpen} onClose={onGovernorsBoardClose} onDone={onGovernorsBoardDone} />
    <SponsorshipNegotiationModal open={sponsorModalOpen} showOnlyActionableSlots onClose={onSponsorClose} />
    <FacilityReviewModal
      open={facilityReviewOpen}
      team={userTeam as any}
      currency={state.leagueStats?.currency ?? 'EUR'}
      onOpenSliders={onFacilityOpenSliders}
      onClose={onFacilityClose}
      onMarkDone={onFacilityMarkDone}
    />
    <BudgetReviewModal
      open={budgetReviewOpen}
      team={userTeam as any}
      players={state.players ?? []}
      state={state}
      currentYear={state.leagueStats?.year ?? new Date().getFullYear()}
      currency={state.leagueStats?.currency ?? 'EUR'}
      onClose={onBudgetClose}
      onMarkDone={onBudgetMarkDone}
    />
    <TeamOptionGateModal
      isOpen={optionsModalOpen}
      players={pendingTeamOptions}
      onAssistant={onOptionsAssistant}
      onManual={onOptionsManual}
      onDismiss={onOptionsDismiss}
      onExerciseOne={onOptionsExerciseOne}
      onDeclineOne={onOptionsDeclineOne}
      exercisedIds={exercisedIds}
      declinedIds={declinedIds}
    />
    {expiringGateModal}
    <QualifyingOfferModal
      isOpen={qoModalOpen}
      players={rfaCandidates}
      leagueStats={state.leagueStats as LeagueStats}
      submittedIds={qoSubmittedIds}
      skippedIds={qoSkippedIds}
      onSubmitOne={onQoSubmitOne}
      onSkipOne={onQoSkipOne}
      onAssistant={onQoAssistant}
      onDismiss={onQoDismiss}
    />
    <YouthPromotionModal
      open={youthPromotionOpen}
      teamName={(userTeam?.name ?? 'Academy')}
      youthPlayers={youthPlayers}
      seniorRosterSize={seniorRosterSize}
      maxRosterSize={maxRosterSize}
      onClose={onYouthClose}
      onPromote={onYouthPromote}
    />
    <ScheduleDrawModal
      open={euroScheduleDrawOpen}
      games={euroScheduleGames}
      seasonLabel={`${Number(state.leagueStats?.year ?? new Date().getFullYear()) - 1}–${String(Number(state.leagueStats?.year ?? new Date().getFullYear())).slice(-2)}`}
      teamName={userTeam ? getTeamFullName(userTeam) : 'Club'}
      teamLogoUrl={userTeam ? getResolvedTeamLogoUrl(userTeam, state.leagueStats?.year) : undefined}
      onClose={onEuroScheduleClose}
      onConfirm={onEuroScheduleDone}
    />
    {state.leagueStats?.uiMode === 'euro_isolated' ? (
      <EuroPreseasonFriendliesScheduler
        open={preseasonFriendliesOpen}
        state={state}
        onScheduleChange={onPreseasonScheduleChange}
        onClose={onPreseasonClose}
        onDone={onPreseasonDone}
      />
    ) : (
      <PreseasonFriendliesModal
        open={preseasonFriendliesOpen}
        games={preseasonGames}
        onClose={onPreseasonClose}
        onDone={onPreseasonDone}
      />
    )}
    <PBAImportDecisionReviewView
      open={pbaImportDecisionOpen}
      state={state}
      onClose={onPbaImportDecisionClose}
      onMarkDone={onPbaImportDecisionDone}
    />
    <PbaMuseSelectionModal
      open={pbaMuseSelectionOpen}
      season={Number(state.leagueStats?.year ?? new Date().getFullYear())}
      teamName={userTeam ? getTeamFullName(userTeam) : 'Your Team'}
      previousSelections={state.pbaMuseSelections ?? EMPTY_MUSE_SELECTIONS}
      onClose={onPbaMuseSelectionClose}
      onChoose={onPbaMuseChosen}
    />
    <PBAOpeningCeremonyView
      open={pbaOpeningCeremonyOpen}
      state={state}
      onExit={onPbaOpeningCeremonyExit}
      onSkip={onPbaOpeningCeremonySkip}
    />
    <OffseasonBriefingModal
      spec={briefingSpec}
      onConfirm={onBriefingConfirm}
      onDismissForever={onBriefingDismissForever}
    />
    <OffseasonStepConfirmModal
      spec={stepConfirm}
      onCancel={onStepCancel}
      onConfirm={onStepConfirm}
      onSecondary={stepConfirm?.secondaryLabel ? onStepSecondary : undefined}
    />
    <OffseasonAutoResolveConfirmModal
      open={autoResolveConfirmOpen}
      isPba={state.leagueStats?.uiMode === 'pba_isolated'}
      onCancel={onAutoResolveCancel}
      onConfirm={onAutoResolveConfirm}
    />
    <RookieContractsDisclaimerModal
      open={rookieDisclaimerOpen}
      isPba={state.leagueStats?.uiMode === 'pba_isolated'}
      leagueStats={state.leagueStats}
      rookies={userTeamRookies.map((p: any) => ({
        internalId: p.internalId,
        name: p.name,
        imgURL: getPlayerImage(p),
        round: p.draft?.round,
        pick: p.draft?.pick,
        eurostashClub: getEurostashEligibility(state, p).eligible ? p.preDraftClub?.name : undefined,
      }))}
      onDismiss={onRookieDismiss}
      onSelectRookie={playerId => {
        const player = userTeamRookies.find(candidate => candidate.internalId === playerId);
        if (player) onRookieSelect(player);
      }}
    />
    {expansionProtectOpen && <PlayerProtectionModal onClose={onExpansionProtectClose} onConfirm={onExpansionProtectConfirm} />}
    {expansionDraftViewOpen && <ExpansionDraftView onClose={onExpansionDraftClose} />}
  </>
);
