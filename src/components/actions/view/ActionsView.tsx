import React, { useState } from 'react';
import { useGame } from '../../../store/GameContext';
import { Users, Eye, Gavel } from 'lucide-react';
import { ActionCard } from '../ActionCard';
import { Contact } from '../../../types';
import { getActionsConfig } from './actionConfig';
import { useActionModals } from '../hooks/useActionModals';
import { ActionModalsRenderer } from './ActionModalsRenderer';
import { SettingsManager } from '../../../services/SettingsManager';
import { useRosterComplianceGate } from '../../../hooks/useRosterComplianceGate';
import { useDraftEventGate } from '../../../hooks/useDraftEventGate';

const ActionsView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const rosterGate = useRosterComplianceGate();
  const draftGate = useDraftEventGate();
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const modals = useActionModals();
  
  const categories = [
    { id: 'executive', name: 'Executive', icon: Gavel, color: 'indigo' },
    { id: 'personal', name: 'Personal', icon: Users, color: 'emerald' },
    { id: 'covert', name: 'Covert', icon: Eye, color: 'rose' }
  ];

  const [activeCategory, setActiveCategory] = useState('executive');

  const handleAction = async (actionType: string, payload?: any) => {
    console.log(`ActionsView: handleAction triggered for ${actionType}`, payload);
    setProcessingAction(actionType);
    await new Promise(resolve => setTimeout(resolve, SettingsManager.getDelay(800)));

    if (actionType === 'HYPNOTIC_BROADCAST') {
        await dispatchAction({
            type: 'SEND_MESSAGE',
            payload: {
                targetName: "The Public",
                targetRole: "Fans",
                message: "Compliance Signal: Obey the Commissioner. Ignore the scandals. Trust the process."
            }
        });
    } else if (actionType === 'PUBLIC_ANNOUNCEMENT') {
        rosterGate.attempt(() => draftGate.attempt(() => dispatchAction({
            type: 'ADVANCE_DAY',
            payload: {
                outcomeText: `Commissioner made a public announcement: "${payload.message}"`,
                isSpecificEvent: true
            }
        })));
    } else if (['EXECUTIVE_TRADE', 'SIGN_FREE_AGENT', 'TRAVEL', 'EXPANSION_DRAFT', 'CELEBRITY_ROSTER', 'GLOBAL_GAMES', 'GIVE_MONEY', 'BRIBE_PERSON', 'FINE_PERSON', 'VISIT_NON_NBA_TEAM', 'TRANSFER_FUNDS', 'SET_CHRISTMAS_GAMES', 'SABOTAGE_PLAYER', 'SUSPEND_PLAYER', 'GO_TO_CLUB', 'ENDORSE_HOF', 'ADD_PRESEASON_INTERNATIONAL', 'INVITE_DINNER', 'DRUG_TEST_PERSON', 'LEAK_SCANDAL', 'WAIVE_PLAYER', 'FIRE_PERSONNEL'].includes(actionType)) {
        await dispatchAction({
            type: actionType as any,
            payload
        });
    } else {
        await dispatchAction({
          type: 'PUBLIC_STATEMENT',
          payload: {
            type: actionType,
            ...payload
          }
        });
    }
    
    setProcessingAction(null);
  };

  const actions = getActionsConfig(state, {
    setAnnouncementModalOpen: modals.setAnnouncementModalOpen,
    openPersonSelector: modals.openPersonSelector,
    setCitySelectorOpen: modals.setCitySelectorOpen,
    setCitySelectorType: modals.setCitySelectorType,
    setCelebrityModalOpen: modals.setCelebrityModalOpen,
    setTradeModalOpen: modals.setTradeModalOpen,
    setTravelModalOpen: modals.setTravelModalOpen,
    setVisitNonNBAModalOpen: modals.setVisitNonNBAModalOpen,
    setSignFreeAgentModalOpen: modals.setSignFreeAgentModalOpen,
    setInvitePerformanceModalOpen: (open: boolean, event?: string) => {
      modals.setInvitePerformanceModalOpen(open);
      if (event) modals.setPerformanceEvent(event);
    },
    setTransferFundsModalOpen: modals.setTransferFundsModalOpen,
    setChristmasModalOpen: modals.setChristmasModalOpen,
    setGlobalGamesModalOpen: modals.setGlobalGamesModalOpen,
    setPreseasonInternationalModalOpen: modals.setPreseasonInternationalModalOpen,
    setRigLotteryModalOpen: modals.setRigLotteryModalOpen,
    confirmAction: modals.openConfirmation
  });

  const handleAnnouncementSubmit = async () => {
      if (!modals.announcementText.trim()) return;
      modals.setAnnouncementModalOpen(false);
      await handleAction('PUBLIC_ANNOUNCEMENT', { message: modals.announcementText });
      modals.setAnnouncementText('');
  };

  const handlePersonSelected = async (contacts: Contact[], reason?: string, amount?: number, location?: string, duration?: string) => {
      modals.setModalOpen(false);
      
      if (modals.modalType === 'contact') {
          if (contacts.length > 0) {
              modals.setSelectedContactForModal(contacts[0]);
          }
          return;
      }

      if (modals.modalType === 'hypnotize') {
          if (contacts.length > 0) {
              const contact = contacts[0];
              const chat = state.chats.find(c => c.participants.includes(contact.id));
              
              await dispatchAction({
                type: 'SEND_CHAT_MESSAGE',
                payload: {
                  chatId: chat?.id,
                  text: `[HYPNOTIC COMMAND]: ${reason}`,
                  targetId: contact.id,
                  targetName: contact.name,
                  targetRole: contact.title,
                  targetOrg: contact.organization || 'Unknown',
                  avatarUrl: contact.playerPortraitUrl,
                  isHypnotized: true
                }
              });
          }
          return;
      }

      let actionType = '';
      if (modals.modalType === 'suspension') actionType = 'SUSPEND_PLAYER';
      if (modals.modalType === 'drug_test') actionType = 'DRUG_TEST_PERSON';
      if (modals.modalType === 'dinner') actionType = 'INVITE_DINNER';
      if (modals.modalType === 'movie') actionType = 'INVITE_DINNER'; // Reuse INVITE_DINNER for now
      if (modals.modalType === 'fine') actionType = 'FINE_PERSON';
      if (modals.modalType === 'bribe') actionType = 'BRIBE_PERSON';
      if (modals.modalType === 'leak_scandal') actionType = 'LEAK_SCANDAL';
      if (modals.modalType === 'give_money') actionType = 'GIVE_MONEY';
      if (modals.modalType === 'sabotage') actionType = 'SABOTAGE_PLAYER';
      if (modals.modalType === 'club') actionType = 'GO_TO_CLUB';
      if (modals.modalType === 'endorse_hof') actionType = 'ENDORSE_HOF';
      if (modals.modalType === 'waive') actionType = 'WAIVE_PLAYER';
      if (modals.modalType === 'fire') actionType = 'FIRE_PERSONNEL';

      const targetNames = contacts.map(c => c.name).join(', ');
      const targetRoles = contacts.map(c => c.title).join(', ');
      const targetIds = contacts.map(c => c.id).join(',');

      let finalReason = reason || (modals.modalType === 'movie' ? "Movie Night" : "No reason provided.");
      if (location) {
          finalReason += ` at ${location}`;
      }

      await handleAction(actionType, {
          targetName: targetNames,
          targetRole: targetRoles,
          targetId: targetIds,
          reason: finalReason,
          amount: amount,
          duration: duration,
          count: contacts.length,
          subType: modals.modalType,
          location: location,
          contacts: contacts,
          fundSource: modals.selectedFundSource
      });
      modals.setSelectedFundSource(null);
  };

  const handleCitySelectionConfirm = async (cities: {name: string, lat: number, lng: number}[]) => {
    modals.setCitySelectorOpen(false);
    const cityNames = cities.map(c => c.name).join(', ');
    
    await handleAction('EXPANSION_DRAFT', { cities: cityNames });
  };

  const handleCelebrityRosterConfirm = async (roster: any[]) => {
      modals.setCelebrityModalOpen(false);
      const rosterNames = roster.map(c => c.name).join(', ');
      await handleAction('CELEBRITY_ROSTER', { roster: rosterNames });
  };

  const handleSendMessage = async (params: { message: string }) => {
    if (modals.selectedContactForModal) {
      const contact = modals.selectedContactForModal;
      const chat = state.chats.find(c => c.participants.includes(contact.id));
      
      await dispatchAction({
        type: 'SEND_CHAT_MESSAGE',
        payload: {
          chatId: chat?.id,
          text: params.message,
          targetId: contact.id,
          targetName: contact.name,
          targetRole: contact.title,
          targetOrg: (contact as any).teamId || 'Unknown',
          avatarUrl: contact.playerPortraitUrl
        }
      });
      
      modals.setSelectedContactForModal(null);
    }
  };

  const executeConfirmedAction = async () => {
      if (modals.confirmActionType) {
          modals.setConfirmModalOpen(false);
          if (modals.confirmActionType === 'EXPANSION_DRAFT') {
              modals.setCitySelectorType('expansion');
              modals.setCitySelectorOpen(true);
          } else if (modals.confirmActionType === 'CELEBRITY_ROSTER') {
              modals.setCelebrityModalOpen(true);
          } else {
              await handleAction(modals.confirmActionType);
          }
          modals.setConfirmActionType(null);
          modals.setConfirmActionDetails(null);
      }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 md:space-y-12 custom-scrollbar bg-slate-950 md:rounded-[2.5rem] border-x border-b md:border border-slate-800 shadow-2xl">
      <div className="max-w-6xl mx-auto space-y-8 md:space-y-12">
        {/* Category Tabs */}
        <div className="flex items-center gap-2 md:gap-4 bg-slate-900/50 p-1.5 md:p-2 rounded-2xl md:rounded-[2rem] border border-slate-800 w-full md:w-fit mx-auto overflow-x-auto no-scrollbar">
            {categories.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 md:gap-3 px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-[1.5rem] transition-all duration-300 whitespace-nowrap ${activeCategory === cat.id ? `bg-indigo-600 text-white shadow-lg shadow-indigo-500/20` : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                >
                    <cat.icon size={16} className="md:w-[18px] md:h-[18px]" />
                    <span className="text-[10px] md:text-sm font-black uppercase tracking-widest">{cat.name}</span>
                </button>
            ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          {actions[activeCategory as keyof typeof actions].map((action) => (
            <ActionCard
              key={action.id}
              {...action}
            />
          ))}
        </div>
      </div>

      <ActionModalsRenderer
        modals={modals}
        state={state}
        handlePersonSelected={handlePersonSelected}
        handleCitySelectionConfirm={handleCitySelectionConfirm}
        handleCelebrityRosterConfirm={handleCelebrityRosterConfirm}
        handleAction={handleAction}
        handleSendMessage={handleSendMessage}
        handleAnnouncementSubmit={handleAnnouncementSubmit}
        executeConfirmedAction={executeConfirmedAction}
      />
      {rosterGate.modal}
      {draftGate.modal}
    </div>
  );
};

export default ActionsView;
