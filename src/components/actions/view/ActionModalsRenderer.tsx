import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, AlertTriangle } from 'lucide-react';
import { FundSourceModal } from '../../modals/FundSourceModal';
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

interface ActionModalsRendererProps {
  modals: any;
  state: any;
  handlePersonSelected: (contacts: any[], reason?: string, amount?: number, location?: string, duration?: string) => void;
  handleCitySelectionConfirm: (cities: any[]) => void;
  handleCelebrityRosterConfirm: (roster: any[]) => void;
  handleAction: (actionType: string, payload?: any) => Promise<void>;
  handleSendMessage: (params: { message: string }) => Promise<void>;
  handleAnnouncementSubmit: () => Promise<void>;
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
  handleAnnouncementSubmit,
  executeConfirmedAction
}) => {
  return (
    <>
      {modals.fundSourceModalOpen && (
          <FundSourceModal 
            onClose={() => modals.setFundSourceModalOpen(false)}
            onSelect={(source) => {
                modals.setSelectedFundSource(source);
                modals.setFundSourceModalOpen(false);
                modals.setModalOpen(true);
            }}
          />
      )}

      {modals.modalOpen && (
        <PersonSelectorModal
          onClose={() => {
              modals.setModalOpen(false);
              modals.setSelectedFundSource(null);
          }}
          onSelect={handlePersonSelected}
          actionType={modals.modalType}
          title={modals.modalType === 'suspension' ? 'Suspend Personnel' :
                 modals.modalType === 'drug_test' ? 'Mandatory Drug Test' :
                 modals.modalType === 'dinner' ? 'Host Private Dinner' :
                 modals.modalType === 'fine' ? 'Levy Fine' :
                 modals.modalType === 'bribe' ? 'Offer Bribe' :
                 modals.modalType === 'movie' ? 'Invite to Movie' :
                 modals.modalType === 'leak_scandal' ? 'Leak Scandal' :
                 modals.modalType === 'give_money' ? 'Disburse Funds' :
                 modals.modalType === 'hypnotize' ? 'Hypnotize Target' :
                 modals.modalType === 'sabotage' ? 'Sabotage Player' :
                 modals.modalType === 'contact' ? 'Contact Person' : 'Select Person'}
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
          onClose={() => {
              console.log("Closing VisitNonNBAModal");
              modals.setVisitNonNBAModalOpen(false);
          }}
          onConfirm={async (visitDetails) => {
              console.log("Confirming VisitNonNBAModal", visitDetails);
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
          nonNBATeams={state.nonNBATeams}
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
          onClose={() => {
            modals.setSelectedContactForModal(null);
          }}
        />
      )}

      <AnimatePresence>
        {modals.announcementModalOpen && (
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
              className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Mic size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-widest">Public Announcement</h3>
                  <p className="text-slate-400 text-sm">Draft your statement to the media</p>
                </div>
              </div>
              <textarea
                value={modals.announcementText}
                onChange={(e) => modals.setAnnouncementText(e.target.value)}
                className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-4 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none mb-6"
                placeholder="Enter your statement..."
              />
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => modals.setAnnouncementModalOpen(false)}
                  className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold uppercase tracking-wider text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAnnouncementSubmit}
                  disabled={!modals.announcementText.trim()}
                  className="px-6 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors font-bold uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Broadcast
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

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
              className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-widest">{modals.confirmActionDetails.title}</h3>
                </div>
              </div>
              <p className="text-slate-300 mb-8 leading-relaxed">
                  {modals.confirmActionDetails.desc}
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => {
                      modals.setConfirmModalOpen(false);
                      modals.setConfirmActionType(null);
                      modals.setConfirmActionDetails(null);
                  }}
                  className="px-6 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold uppercase tracking-wider text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={executeConfirmedAction}
                  className="px-6 py-3 rounded-xl bg-amber-600 text-white hover:bg-amber-500 transition-colors font-bold uppercase tracking-wider text-sm"
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
