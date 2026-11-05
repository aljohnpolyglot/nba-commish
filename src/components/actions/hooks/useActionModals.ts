import { useState } from 'react';
import { Contact } from '../../../types';

export const useActionModals = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFundSource, setSelectedFundSource] = useState<'personal' | 'league' | null>(null);
  const [modalType, setModalType] = useState<'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'movie' | 'give_money' | 'hypnotize' | 'sabotage' | 'club' | 'endorse_hof' | 'waive' | 'fire'>('general');
  
  // Contact Modal State
  const [selectedContactForModal, setSelectedContactForModal] = useState<Contact | null>(null);
  
  // City Selector State
  const [citySelectorOpen, setCitySelectorOpen] = useState(false);
  const [citySelectorType, setCitySelectorType] = useState<'expansion'>('expansion');

  const [celebrityModalOpen, setCelebrityModalOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [travelModalOpen, setTravelModalOpen] = useState(false);
  const [visitNonNBAModalOpen, setVisitNonNBAModalOpen] = useState(false);
  const [signFreeAgentModalOpen, setSignFreeAgentModalOpen] = useState(false);
  const [invitePerformanceModalOpen, setInvitePerformanceModalOpen] = useState(false);
  const [performanceEvent, setPerformanceEvent] = useState<string | null>(null);
  const [transferFundsModalOpen, setTransferFundsModalOpen] = useState(false);
  const [christmasModalOpen, setChristmasModalOpen] = useState(false);
  const [globalGamesModalOpen, setGlobalGamesModalOpen] = useState(false);
  const [preseasonInternationalModalOpen, setPreseasonInternationalModalOpen] = useState(false);

  // Expansion Draft (ZenGM-style, Phase 2 Modals — Phase 1 nur State-Plumbing)
  const [expansionSetupModalOpen, setExpansionSetupModalOpen] = useState(false);
  const [expansionProtectModalOpen, setExpansionProtectModalOpen] = useState(false);
  const [expansionDraftViewOpen, setExpansionDraftViewOpen] = useState(false);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmActionType, setConfirmActionType] = useState<string | null>(null);
  const [confirmActionDetails, setConfirmActionDetails] = useState<{title: string, desc: string} | null>(null);

  const openPersonSelector = (type: 'suspension' | 'drug_test' | 'dinner' | 'fine' | 'movie' | 'give_money' | 'hypnotize' | 'sabotage' | 'club' | 'endorse_hof' | 'waive' | 'fire') => {
      if (type === 'give_money') {
          setSelectedFundSource('league');
          setModalType(type);
          setModalOpen(true);
      } else {
          setModalType(type);
          setModalOpen(true);
      }
  };

  const openCitySelector = (type: 'expansion') => {
      setCitySelectorType(type);
      setCitySelectorOpen(true);
  };

  const openConfirmation = (actionType: string, title: string, desc: string) => {
      setConfirmActionType(actionType);
      setConfirmActionDetails({ title, desc });
      setConfirmModalOpen(true);
  };

  return {
    modalOpen, setModalOpen,
    selectedFundSource, setSelectedFundSource,
    modalType, setModalType,
    selectedContactForModal, setSelectedContactForModal,
    citySelectorOpen, setCitySelectorOpen,
    citySelectorType, setCitySelectorType,
    celebrityModalOpen, setCelebrityModalOpen,
    tradeModalOpen, setTradeModalOpen,
    travelModalOpen, setTravelModalOpen,
    visitNonNBAModalOpen, setVisitNonNBAModalOpen,
    signFreeAgentModalOpen, setSignFreeAgentModalOpen,
    invitePerformanceModalOpen, setInvitePerformanceModalOpen,
    performanceEvent, setPerformanceEvent,
    transferFundsModalOpen, setTransferFundsModalOpen,
    christmasModalOpen, setChristmasModalOpen,
    globalGamesModalOpen, setGlobalGamesModalOpen,
    preseasonInternationalModalOpen, setPreseasonInternationalModalOpen,
    expansionSetupModalOpen, setExpansionSetupModalOpen,
    expansionProtectModalOpen, setExpansionProtectModalOpen,
    expansionDraftViewOpen, setExpansionDraftViewOpen,
    confirmModalOpen, setConfirmModalOpen,
    confirmActionType, setConfirmActionType,
    confirmActionDetails, setConfirmActionDetails,
    openPersonSelector,
    openCitySelector,
    openConfirmation
  };
};
