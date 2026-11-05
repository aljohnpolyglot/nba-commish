import React from 'react';
import { useGame } from '../../store/GameContext';
import { GmReviewModal } from './GmReviewModal';
import { GmContractDecisionModal, GmOffersModal } from './GmContractOffersModal';

export const GmCareerOverlay: React.FC = () => {
  const { state } = useGame();
  if (state.gameMode !== 'gm' || !state.gmCareer) return null;
  if (state.offseasonChecklist?.performanceReview !== 'in-progress') return null;
  if (state.gmCareer.pendingReview) return <GmReviewModal review={state.gmCareer.pendingReview} />;
  if (state.gmCareer.jobOffers) return <GmOffersModal offers={state.gmCareer.jobOffers} />;
  if (state.gmCareer.pendingContractDecision) return <GmContractDecisionModal decision={state.gmCareer.pendingContractDecision} />;
  return null;
};
