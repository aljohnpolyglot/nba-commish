import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { PlayerBioContractTab } from '../../central/view/PlayerBioContractTab';
import { PlayerBioMoraleTab } from '../../central/view/PlayerBioMoraleTab';
import { isPlausibleActiveMarket } from '../../../services/freeAgencyBidding';
import SigningModalFinancesTab from './SigningModalFinancesTab';
import SigningModalFooter from './SigningModalFooter';
import SigningModalNegotiationTab from './SigningModalNegotiationTab';
import SigningModalOffersTab from './SigningModalOffersTab';
import {
  SigningModalBidSubmittedOverlay,
  SigningModalBuyoutRefusedOverlay,
  SigningModalCapWarningOverlay,
  SigningModalOverLimitOverlay,
  SigningModalPendingCashOverlay,
  SigningModalPreflightOverlay,
  SigningModalResponseOverlay,
  SigningModalRosterFullOverlay,
} from './SigningModalOverlays';
import SigningModalPlayerPanel from './SigningModalPlayerPanel';
import type { SigningModalProps } from './SigningModalTypes';
import { useSigningModalController } from './useSigningModalController';

const SigningModal: React.FC<SigningModalProps> = props => {
  const modal = useSigningModalController(props);

  if (modal.overLimitAction) {
    return (
      <SigningModalOverLimitOverlay
        action={modal.overLimitAction}
        onCancel={() => modal.setOverLimitAction(null)}
        onContinue={action => {
          modal.setOverLimitAction(null);
          if (action === 'sign') modal.submitSigning(true);
          else modal.setShowResponse(true);
        }}
      />
    );
  }

  if (modal.showCapWarning) {
    return (
      <SigningModalCapWarningOverlay
        autoAccept={modal.autoAccept}
        money={modal.money}
        moneyPrecise={modal.moneyPrecise}
        onClose={modal.onClose}
        onForce={() => {
          modal.setShowCapWarning(false);
          modal.submitSigning();
        }}
        onRetry={() => modal.setShowCapWarning(false)}
        overBy={modal.capWarningOverBy}
        player={modal.player}
        projectedPayroll={modal.capWarningProjectedPayroll}
        salary={modal.salary}
        team={modal.team}
      />
    );
  }

  if (modal.pendingCashAck) {
    return (
      <SigningModalPendingCashOverlay
        deficit={modal.projectedCashAfterDeal ?? 0}
        moneyPrecise={modal.moneyPrecise}
        onAcknowledge={() => {
          const fn = modal.pendingCashAck;
          modal.setPendingCashAck(null);
          fn?.();
        }}
        onReconsider={() => modal.setPendingCashAck(null)}
        player={modal.player}
      />
    );
  }

  if (modal.roster.totalFull && !modal.rosterFullOverridden && !modal.isResign && !modal.teamHoldsBirdRights) {
    return (
      <SigningModalRosterFullOverlay
        autoAccept={modal.autoAccept}
        onClose={modal.onClose}
        onForce={() => modal.setRosterFullOverridden(true)}
        player={modal.player}
        roster={modal.roster}
        stateDate={modal.state.date}
        team={modal.team}
      />
    );
  }

  if (modal.preflightMessage && !modal.preflightOverridden) {
    return (
      <SigningModalPreflightOverlay
        autoAccept={modal.autoAccept}
        onAcknowledge={modal.onClose}
        onForce={() => modal.setPreflightOverridden(true)}
        player={modal.player}
        playerFace={modal.playerFace}
        portraitFallback={modal.portraitFallback}
        preflightMessage={modal.preflightMessage}
        teamColors={modal.teamColors}
      />
    );
  }

  if (modal.bidSubmitted) {
    return (
      <SigningModalBidSubmittedOverlay
        bidSubmitted={modal.bidSubmitted}
        onDone={() => {
          modal.setBidSubmitted(null);
          modal.onClose();
        }}
        player={modal.player}
        playerFace={modal.playerFace}
        portraitFallback={modal.portraitFallback}
        teamColors={modal.teamColors}
      />
    );
  }

  if (modal.showResponse && !modal.motherTeamWillRelease) {
    return (
      <SigningModalBuyoutRefusedOverlay
        autoAccept={modal.autoAccept}
        buyout={modal.buyout}
        money={modal.money}
        motherTeam={modal.motherTeam}
        onBack={() => modal.setShowResponse(false)}
        onForce={() => modal.submitSigning()}
        player={modal.player}
        totalBuyoutPaidUSD={modal.totalBuyoutPaidUSD}
      />
    );
  }

  if (modal.showResponse) {
    return (
      <SigningModalResponseOverlay
        autoAccept={modal.autoAccept}
        onAcknowledge={modal.onClose}
        onFinalize={() => modal.submitSigning()}
        player={modal.player}
        playerFace={modal.playerFace}
        portraitFallback={modal.portraitFallback}
        teamColors={modal.teamColors}
        teamId={modal.team.id}
        uncappedInterest={modal.uncappedInterest}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start lg:items-center justify-center bg-black/95 backdrop-blur-md pointer-events-none overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
    >
      <AnimatePresence>
        {modal.toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] bg-rose-600/90 border border-rose-400 text-white text-xs font-bold uppercase tracking-widest px-5 py-3 rounded-sm shadow-xl pointer-events-auto max-w-md text-center"
          >
            {modal.toast}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ scale: 0.97, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="relative w-full max-w-[1400px] m-0 lg:m-8 bg-[#0a0a0a] lg:border lg:border-white/5 lg:rounded-sm overflow-hidden flex flex-col shadow-[0_0_120px_rgba(0,0,0,0.9)] pointer-events-auto h-[100dvh] lg:h-[85vh] lg:max-h-[900px]"
      >
        <div className="flex items-center justify-between px-8 py-4 bg-gradient-to-r from-[#e21d37] to-[#7a0018] shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black italic uppercase tracking-[0.4em] text-white/80">Offer Contract</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 border-l border-white/20 pl-4">
              {modal.team.name}
            </span>
          </div>
          <button
            onClick={modal.onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/20 text-white/70 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          <SigningModalPlayerPanel
            fullBodyRender={modal.fullBodyRender}
            imgAllFailed={modal.imgAllFailed}
            limits={modal.limits}
            money={modal.money}
            onAllImagesFailed={() => modal.setImgAllFailed(true)}
            player={modal.player}
            playerFace={modal.playerFace}
            portraitFallback={modal.portraitFallback}
            realAge={modal.realAge}
            seasonYear={modal.seasonYear}
            team={modal.team}
            teamColors={modal.teamColors}
          />

          <div className="flex-1 flex flex-col min-w-0 bg-[#080808] overflow-hidden">
            <div className="flex bg-[#0f0f0f] border-b border-white/5 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {modal.tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => modal.setActiveTab(id)}
                  className={`relative flex items-center gap-2 px-7 py-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
                    modal.activeTab === id ? 'text-[#e21d37]' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                  {modal.activeTab === id && (
                    <motion.div layoutId="tab-line" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e21d37]" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-8 xl:p-10 pb-28 space-y-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {modal.activeTab === 'NEGOTIATION' && (
                <SigningModalNegotiationTab
                  buyout={modal.buyout}
                  canOfferTwoWay={modal.canOfferTwoWay}
                  competingInterest={modal.competingInterest}
                  contractType={modal.contractType}
                  decOptionProps={modal.decOptionProps}
                  decSalaryProps={modal.decSalaryProps}
                  decYearsProps={modal.decYearsProps}
                  euroIsolated={modal.euroIsolated}
                  pbaIsolated={modal.pbaIsolated}
                  formattedYears={modal.formattedYears}
                  gmSpending={modal.gmSpending}
                  hasOwnTeamBirdRights={modal.hasOwnTeamBirdRights}
                  incOptionProps={modal.incOptionProps}
                  incSalaryProps={modal.incSalaryProps}
                  incYearsProps={modal.incYearsProps}
                  interest={modal.interest}
                  interestColor={modal.interestColor}
                  isOwnTeamGM={modal.isOwnTeamGM}
                  isPbaImportSigning={modal.isPbaImportSigning}
                  isResign={modal.isResign}
                  isTrainingCampPeriod={modal.isTrainingCampPeriod}
                  leagueYear={modal.leagueStats?.year ?? new Date().getFullYear()}
                  limits={modal.limits}
                  maxAllowed={modal.maxAllowed}
                  minAllowed={modal.minAllowed}
                  money={modal.money}
                  moneyPrecise={modal.moneyPrecise}
                  option={modal.option}
                  player={modal.player}
                  roster={modal.roster}
                  salary={modal.salary}
                  setContractType={modal.setContractType}
                  setTeamBuyoutContribUSD={modal.setTeamBuyoutContribUSD}
                  teamBuyoutContribUSD={modal.teamBuyoutContribUSD}
                  teamHoldsBirdRights={modal.teamHoldsBirdRights}
                  totalBuyoutPaidUSD={modal.totalBuyoutPaidUSD}
                  yearsTable={modal.yearsTable}
                />
              )}

              {modal.activeTab === 'MORALE' && <PlayerBioMoraleTab player={modal.player} />}
              {modal.activeTab === 'CONTRACT' && <PlayerBioContractTab player={modal.player} />}

              {modal.activeTab === 'FINANCES' && (
                <SigningModalFinancesTab
                  initialOffer={modal.initialOffer}
                  mle={modal.mle}
                  money={modal.money}
                  playerOverallRating={modal.player.overallRating}
                  teamPayroll={modal.teamPayroll}
                  thresholds={modal.thresholds}
                />
              )}

              {modal.activeTab === 'OFFERS' && (
                <SigningModalOffersTab
                  isPlausibleActiveMarket={isPlausibleActiveMarket}
                  leagueStats={modal.leagueStats}
                  player={modal.player}
                  state={modal.state}
                />
              )}
            </div>

            <SigningModalFooter
              autoAccept={modal.autoAccept}
              contractType={modal.contractType}
              euroIsolated={modal.euroIsolated}
              pbaIsolated={modal.pbaIsolated}
              hasOwnTeamBirdRights={modal.hasOwnTeamBirdRights}
              isResign={modal.isResign}
              leagueYear={modal.leagueStats.year}
              limitsMinSalaryUSD={modal.limits.minSalaryUSD}
              mle={modal.mle}
              money={modal.money}
              onClose={modal.onClose}
              onMleSubmit={modal.handleMleSubmit}
              onPrimarySubmit={modal.handlePrimarySubmit}
              onShowCapWarning={() => modal.setShowCapWarning(true)}
              playerInternalId={modal.player.internalId}
              players={modal.state.players}
              salary={modal.salary}
              shouldSubmitBid={modal.shouldSubmitBid}
              teamId={modal.team.id}
              thresholdsSalaryCap={modal.thresholds.salaryCap}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SigningModal;
