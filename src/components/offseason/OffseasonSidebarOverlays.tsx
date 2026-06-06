import React from 'react';
import { FastForward } from 'lucide-react';
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
import { QualifyingOfferModal } from './OffseasonSidebarBits';
import {
  OffseasonAutoResolveConfirmModal,
  OffseasonBriefingModal,
  OffseasonStepConfirmModal,
  PreseasonFriendliesModal,
  RookieContractsDisclaimerModal,
  YouthPromotionModal,
} from './OffseasonModalDeck';

type Props = {
  state: any;
  userTeam: any;
  tmWindowCounter: { current: number; total: number; isLast?: boolean } | null;
  transferWindowSimPending: boolean;
  retiredReviewOpen: boolean;
  staffRetirementsOpen: boolean;
  hofCeremonyOpen: boolean;
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
  preseasonFriendliesOpen: boolean;
  preseasonGames: Array<{ key: string; dateLabel: string; matchup: string }>;
  stepConfirm: any;
  briefingSpec: { eyebrow: string; title: string; body: string } | null;
  autoResolveConfirmOpen: boolean;
  rookieDisclaimerOpen: boolean;
  userTeamRookies: NBAPlayer[];
  expansionProtectOpen: boolean;
  expansionDraftViewOpen: boolean;
  onRetiredClose: () => void;
  onStaffRetirementsClose: () => void;
  onHofClose: () => void;
  onSponsorClose: () => void;
  onFacilityOpenSliders: () => void;
  onFacilityClose: () => void;
  onFacilityMarkDone: () => void;
  onTransferWindowSimDay: () => void;
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
  onPreseasonClose: () => void;
  onPreseasonDone: () => void;
  onStepCancel: () => void;
  onStepConfirm: () => void;
  onBriefingConfirm: () => void;
  onBriefingDismissForever: () => void;
  onAutoResolveCancel: () => void;
  onAutoResolveConfirm: () => void;
  onRookieDismiss: () => void;
  onExpansionProtectClose: () => void;
  onExpansionProtectConfirm: (protections: any) => Promise<void>;
  onExpansionDraftClose: () => void;
};

export const OffseasonSidebarOverlays: React.FC<Props> = ({
  state,
  userTeam,
  tmWindowCounter,
  transferWindowSimPending,
  retiredReviewOpen,
  staffRetirementsOpen,
  hofCeremonyOpen,
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
  preseasonFriendliesOpen,
  preseasonGames,
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
  onSponsorClose,
  onFacilityOpenSliders,
  onFacilityClose,
  onFacilityMarkDone,
  onTransferWindowSimDay,
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
  onPreseasonClose,
  onPreseasonDone,
  onStepCancel,
  onStepConfirm,
  onBriefingConfirm,
  onBriefingDismissForever,
  onAutoResolveCancel,
  onAutoResolveConfirm,
  onRookieDismiss,
  onExpansionProtectClose,
  onExpansionProtectConfirm,
  onExpansionDraftClose,
}) => (
  <>
    <RetiredPlayersReviewModal isOpen={retiredReviewOpen} onClose={onRetiredClose} />
    <StaffRetirementsReviewModal isOpen={staffRetirementsOpen} onClose={onStaffRetirementsClose} />
    <HOFCeremonyModal isOpen={hofCeremonyOpen} onClose={onHofClose} />
    <SponsorshipNegotiationModal open={sponsorModalOpen} showOnlyActionableSlots onClose={onSponsorClose} />
    <FacilityReviewModal
      open={facilityReviewOpen}
      team={userTeam as any}
      currency={state.leagueStats?.currency ?? 'EUR'}
      onOpenSliders={onFacilityOpenSliders}
      onClose={onFacilityClose}
      onMarkDone={onFacilityMarkDone}
      footerLeft={tmWindowCounter ? (
        <div className="flex items-center gap-3 rounded-xl border border-sky-500/30 bg-slate-900/70 px-3 py-2">
          <div className="flex flex-col leading-none">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-sky-300/80">Player Market</span>
            <span className="text-sm font-black text-white tabular-nums uppercase tracking-tight">
              Day {tmWindowCounter.current}/{tmWindowCounter.total}
            </span>
          </div>
          <button
            onClick={onTransferWindowSimDay}
            disabled={state.isProcessing || transferWindowSimPending || tmWindowCounter.isLast}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
              state.isProcessing || transferWindowSimPending || tmWindowCounter.isLast
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-sky-500 hover:bg-sky-400 text-black'
            }`}
          >
            <FastForward size={12} /> Sim Day
          </button>
        </div>
      ) : null}
    />
    <BudgetReviewModal
      open={budgetReviewOpen}
      team={userTeam as any}
      players={state.players ?? []}
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
      onClose={onYouthClose}
      onPromote={onYouthPromote}
    />
    <PreseasonFriendliesModal
      open={preseasonFriendliesOpen}
      games={preseasonGames}
      onClose={onPreseasonClose}
      onDone={onPreseasonDone}
    />
    <OffseasonBriefingModal
      spec={briefingSpec}
      onConfirm={onBriefingConfirm}
      onDismissForever={onBriefingDismissForever}
    />
    <OffseasonStepConfirmModal spec={stepConfirm} onCancel={onStepCancel} onConfirm={onStepConfirm} />
    <OffseasonAutoResolveConfirmModal
      open={autoResolveConfirmOpen}
      isPba={state.leagueStats?.uiMode === 'pba_isolated'}
      onCancel={onAutoResolveCancel}
      onConfirm={onAutoResolveConfirm}
    />
    <RookieContractsDisclaimerModal
      open={rookieDisclaimerOpen}
      rookies={userTeamRookies.map((p: any) => ({
        internalId: p.internalId,
        name: p.name,
        round: p.draft?.round,
        pick: p.draft?.pick,
      }))}
      onDismiss={onRookieDismiss}
    />
    {expansionProtectOpen && <PlayerProtectionModal onClose={onExpansionProtectClose} onConfirm={onExpansionProtectConfirm} />}
    {expansionDraftViewOpen && <ExpansionDraftView onClose={onExpansionDraftClose} />}
  </>
);
