import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import { CitySelectorModal } from '../../modals/CitySelectorModal';
import { CelebrityRosterModal } from '../../modals/CelebrityRosterModal';
import { TradeMachineModal } from '../../modals/TradeMachineModal';
import { TravelModal } from '../../modals/TravelModal';
import { VisitNonNBAModal } from '../VisitNonNBATeams';
import { SignFreeAgentModal } from '../../modals/SignFreeAgentModal';
import { InvitePerformanceModal } from '../../modals/InvitePerformanceModal';
import { TransferFundsModal } from '../../modals/TransferFundsModal';
import { ChristmasGamesModal } from '../../modals/ChristmasGamesModal';
import { GlobalGamesModal } from '../../modals/GlobalGamesModal';
import { PreseasonInternationalModal } from '../../modals/PreseasonInternationalModal';
import ContactModal from '../../ContactModal';
import { ExpansionDraftSetupModal } from '../../expansion/ExpansionDraftSetupModal';
import { PlayerProtectionModal } from '../../expansion/PlayerProtectionModal';
import { ExpansionDraftView } from '../../expansion/ExpansionDraftView';

interface ActionModalsRendererProps {
  modals: any;
  state: any;
  handlePersonSelected: (contacts: any[], reason?: string, amount?: number, location?: string, duration?: string) => void;
  handleCitySelectionConfirm: (cities: any[]) => void;
  handleCelebrityRosterConfirm: (roster: any[]) => void;
  handleAction: (actionType: string, payload?: any) => Promise<void>;
  handleSendMessage: (params: { message: string }) => Promise<void>;
  executeConfirmedAction: () => Promise<void>;
}

export const ActionModalsRenderer: React.FC<ActionModalsRendererProps> = ({
  modals,
  state,
  handlePersonSelected,
  handleCitySelectionConfirm,
  handleCelebrityRosterConfirm,
  handleAction,
  handleSendMessage,
  executeConfirmedAction
}) => {
  return (
    <>
      {modals.modalOpen && (
        <PersonSelectorModal
          onClose={() => {
              modals.setModalOpen(false);
              modals.setSelectedFundSource(null);
          }}
          onSelect={handlePersonSelected}
          actionType={modals.modalType}
          fundSource={modals.modalType === 'give_money' ? modals.selectedFundSource ?? 'league' : undefined}
          onFundSourceChange={modals.modalType === 'give_money' ? modals.setSelectedFundSource : undefined}
          title={modals.modalType === 'suspension' ? 'Suspend Personnel' :
                 modals.modalType === 'drug_test' ? 'Mandatory Drug Test' :
                 modals.modalType === 'dinner' ? 'Host Private Dinner' :
                 modals.modalType === 'fine' ? 'Levy Fine' :
                 modals.modalType === 'movie' ? 'Invite to Movie' :
                 modals.modalType === 'give_money' ? 'Disburse Funds' :
                 modals.modalType === 'hypnotize' ? 'Hypnotize Target' :
                 modals.modalType === 'sabotage' ? 'Sabotage Player' :
                 modals.modalType === 'contact' ? 'Contact Person' :
                 modals.modalType === 'endorse_hof' ? 'Endorse for Hall of Fame' :
                 modals.modalType === 'waive' ? 'Waive Player' :
                 modals.modalType === 'fire' ? 'Fire Personnel' : 'Select Person'}
        />
      )}

      {modals.citySelectorOpen && (
        <CitySelectorModal
          onClose={() => modals.setCitySelectorOpen(false)}
          onConfirm={handleCitySelectionConfirm}
          type={modals.citySelectorType}
          title="League Expansion"
          description="Select cities for new NBA franchises."
        />
      )}

      {modals.expansionSetupModalOpen && (
        <ExpansionDraftSetupModal
          onClose={() => modals.setExpansionSetupModalOpen(false)}
          onConfirm={async (payload) => {
            modals.setExpansionSetupModalOpen(false);
            await handleAction('SCHEDULE_EXPANSION', payload);
            // Mit Grace-Period (>= currentYear+1) wird das Protect-Modal nicht
            // sofort aufgemacht — der User landet erst in der Saison X auf
            // dem Protect-Modal via Action-Card-Klick (skip Setup).
          }}
        />
      )}

      {modals.expansionProtectModalOpen && (
        <PlayerProtectionModal
          onClose={() => modals.setExpansionProtectModalOpen(false)}
          onConfirm={async (protections) => {
            modals.setExpansionProtectModalOpen(false);
            await handleAction('SET_EXPANSION_PROTECTIONS', { protections });
            // Apply realignment + add expansion teams BEFORE opening draft view
            await handleAction('APPLY_EXPANSION_REALIGNMENT', {});
            modals.setExpansionDraftViewOpen(true);
          }}
        />
      )}

      {modals.expansionDraftViewOpen && (
        <ExpansionDraftView
          onClose={() => modals.setExpansionDraftViewOpen(false)}
        />
      )}

      {modals.celebrityModalOpen && (
        <CelebrityRosterModal
          onClose={() => modals.setCelebrityModalOpen(false)}
          onConfirm={handleCelebrityRosterConfirm}
        />
      )}

      {modals.tradeModalOpen && (
        <TradeMachineModal
          onClose={() => modals.setTradeModalOpen(false)}
          onConfirm={async (tradeDetails) => {
              modals.setTradeModalOpen(false);
              await handleAction('EXECUTIVE_TRADE', tradeDetails);
          }}
        />
      )}

      {modals.travelModalOpen && (
        <TravelModal
          onClose={() => modals.setTravelModalOpen(false)}
          onConfirm={async (travelDetails) => {
              modals.setTravelModalOpen(false);
              await handleAction('TRAVEL', travelDetails);
          }}
        />
      )}

      {modals.visitNonNBAModalOpen && (
        <VisitNonNBAModal
          isOpen={modals.visitNonNBAModalOpen}
          onClose={() => modals.setVisitNonNBAModalOpen(false)}
          onConfirm={async (visitDetails) => {
              modals.setVisitNonNBAModalOpen(false);
              await handleAction('VISIT_NON_NBA_TEAM', visitDetails);
          }}
        />
      )}

      {modals.signFreeAgentModalOpen && (
        <SignFreeAgentModal
          onClose={() => modals.setSignFreeAgentModalOpen(false)}
          onConfirm={async (signingDetails) => {
              modals.setSignFreeAgentModalOpen(false);
              await handleAction('SIGN_FREE_AGENT', signingDetails);
          }}
        />
      )}

      {modals.invitePerformanceModalOpen && (
        <InvitePerformanceModal
          onClose={() => modals.setInvitePerformanceModalOpen(false)}
          onConfirm={async (performanceDetails) => {
              modals.setInvitePerformanceModalOpen(false);
              await handleAction('INVITE_PERFORMANCE', performanceDetails);
          }}
        />
      )}

      <TransferFundsModal
        isOpen={modals.transferFundsModalOpen}
        onClose={() => modals.setTransferFundsModalOpen(false)}
        onConfirm={async (payload) => {
            await handleAction('TRANSFER_FUNDS', payload);
        }}
      />

      {modals.christmasModalOpen && (
        <ChristmasGamesModal
          teams={state.teams}
          onClose={() => modals.setChristmasModalOpen(false)}
          onConfirm={async (games) => {
            modals.setChristmasModalOpen(false);
            await handleAction('SET_CHRISTMAS_GAMES', { games });
          }}
          initialGames={state.christmasGames}
        />
      )}

      {modals.globalGamesModalOpen && (
        <GlobalGamesModal
          teams={state.teams}
          players={state.players ?? []}
          seasonYear={state.leagueStats?.year}
          leagueStats={state.leagueStats}
          onClose={() => modals.setGlobalGamesModalOpen(false)}
          onConfirm={async (games) => {
            modals.setGlobalGamesModalOpen(false);
            await handleAction('GLOBAL_GAMES', { games });
          }}
        />
      )}

      {modals.preseasonInternationalModalOpen && (
        <PreseasonInternationalModal
          teams={state.teams}
          nonNBATeams={state.nonNBATeams ?? []}
          players={state.players ?? []}
          seasonYear={state.leagueStats?.year}
          leagueStats={state.leagueStats}
          onClose={() => modals.setPreseasonInternationalModalOpen(false)}
          onConfirm={async (payloads) => {
            modals.setPreseasonInternationalModalOpen(false);
            await handleAction('ADD_PRESEASON_INTERNATIONAL', { games: payloads });
          }}
        />
      )}

      {modals.selectedContactForModal && (
        <ContactModal
          contact={modals.selectedContactForModal}
          onClose={() => modals.setSelectedContactForModal(null)}
          onSend={handleSendMessage}
          isLoading={state.isProcessing}
        />
      )}

      <AnimatePresence>
        {modals.confirmModalOpen && modals.confirmActionDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 p-4 sm:p-8 rounded-[2rem] max-w-md w-full max-h-[calc(100vh-2rem)] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-widest break-words">{modals.confirmActionDetails.title}</h3>
                </div>
              </div>
              <p className="text-slate-300 mb-8 leading-relaxed">
                  {modals.confirmActionDetails.desc}
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-4">
                <button
                  onClick={() => {
                      modals.setConfirmModalOpen(false);
                      modals.setConfirmActionType(null);
                      modals.setConfirmActionDetails(null);
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold uppercase tracking-wider text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={executeConfirmedAction}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-600 text-white hover:bg-amber-500 transition-colors font-bold uppercase tracking-wider text-sm"
                >
                  Confirm Action
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
};
