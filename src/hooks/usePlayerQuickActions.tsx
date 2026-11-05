import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { PlayerActionsModal } from '../components/shared/PlayerActionsModal';
import { PlayerRatingsModal } from '../components/modals/PlayerRatingsModal';
import { DraftScoutingModal } from '../components/draft/DraftScoutingModal';
import { FAOffersModal } from '../components/modals/FAOffersModal';
import { WaiveConfirmModal } from '../components/modals/WaiveConfirmModal';
import type { NBAPlayer } from '../types';
import { formatGameDateShort, getCurrentOffseasonEffectiveFAStart, getDraftCombineStartDate, isInPreFreeAgencyBlackout, parseGameDate, toISODateString } from '../utils/dateUtils';
import { isOnRoster, resolveAnyTeam } from '../utils/teamLookup';
import { isPbaIsolatedMode } from '../utils/uiMode';
import { isInLoanWindow, isTransferWindowOpen } from '../utils/transferWindow';
import { getTwoWayRosterLimit } from '../utils/rosterLimits';
import { areTwoWayContractsEnabled, isTwoWayContract } from '../utils/contractTypes';
import { canSignInCurrentPbaWindow } from '../services/pba/importManager';
import { getPbaDraftPool } from '../services/pba/draftRules';
import { isDraftProspectLike } from '../utils/prospectUtils';
import {
  batchComparisonsDeduped,
} from '../services/scoutingReport';
import {
  ensureDraftScouting,
  getCachedDraftScouting,
  matchProspectToGist,
} from '../services/draftScoutingGist';
import { isExternalLeaguePlayer } from '../utils/playerLeagueScope';
import { isTransferMarketEligibleTeam } from '../services/transfer/marketEligibility';
import { getEuroTransferInquiryState, type EuroTransferInquiryState } from '../services/transfer/playerInquiry';
import { EuroPlayerInquiryModal } from '../components/transferMarket/EuroPlayerInquiryModal';
import { usePlayerPersonActions } from './usePlayerPersonActions';
import { AllStarReplacementModal } from '../components/seasonal/modals/AllStarReplacementModal';
import {
  HallOfFameEndorsementConfirmModal,
  HallOfFameEndorsementSubmittedModal,
} from '../components/modals/HallOfFameEndorsementSubmittedModal';
import { getContactFromPlayer } from '../components/players/view/freeAgentsViewData';
import { updateTradingBlock } from '../store/tradingBlockStore';

type FreeAgencyOpeningGateState = {
  date?: string;
  leagueStats?: Parameters<typeof isInPreFreeAgencyBlackout>[2] & { year?: number; uiMode?: string | null };
  schedule?: Parameters<typeof isInPreFreeAgencyBlackout>[3];
  moddedLeagueBase?: string | null;
};

export function getPlayerPreFreeAgencyStartLabel(
  state: FreeAgencyOpeningGateState,
  player: Pick<NBAPlayer, 'tid' | 'status'>,
): string | null {
  if (isPbaIsolatedMode(state)) return null;
  if (player.tid !== -1 && player.status !== 'Free Agent') return null;
  if (!state.date) return null;
  const current = parseGameDate(state.date);
  const seasonYear = state.leagueStats?.year ?? current.getUTCFullYear();
  if (!isInPreFreeAgencyBlackout(current, seasonYear, state.leagueStats, state.schedule)) return null;
  return formatGameDateShort(getCurrentOffseasonEffectiveFAStart(current, state.leagueStats, state.schedule));
}

/**
 * Unified "click a player name" handler — one hook that owns the entire modal stack:
 *   • PlayerActionsModal           (the quick-actions menu)
 *   • PlayerRatingsModal           (from "View Ratings")
 *   • Canonical Player Bio route  (from "View Bio")
 *   • SignFreeAgentModal           (from "Sign Free Agent" / "Re-sign Player")
 *   • WAIVE_PLAYER dispatch        (from "Waive")
 *
 * Usage in any list view:
 *   const quick = usePlayerQuickActions();
 *   ...
 *   <tr onClick={() => quick.openFor(player)}>...</tr>
 *   ...
 *   // Player Bio navigation is owned by the save-scoped deep-link route.
 *   return quick.fullPageView ?? (<>
 *     <MyTableUI />
 *     {quick.portals}
 *   </>);
 */
export function usePlayerQuickActions() {
  const { state, dispatchAction, healPlayer, setCurrentView, navigateToPlayer, closeDeepLink } = useGame();
  const personActions = usePlayerPersonActions();

  const [actionsPlayer, setActionsPlayer] = useState<NBAPlayer | null>(null);
  const [actionsContext, setActionsContext] = useState<'default' | 'draft-scouting' | 'retirement-review'>('default');
  const [ratingsPlayer, setRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [scoutingPlayer, setScoutingPlayer] = useState<NBAPlayer | null>(null);
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
  const [resignTeamId, setResignTeamId] = useState<number | null>(null);
  const [forceContractType, setForceContractType] = useState<'GUARANTEED' | 'TWO_WAY' | undefined>(undefined);
  const [offersPlayer, setOffersPlayer] = useState<NBAPlayer | null>(null);
  const [waivePlayer, setWaivePlayer] = useState<NBAPlayer | null>(null);
  const [allStarReplacementPlayer, setAllStarReplacementPlayer] = useState<NBAPlayer | null>(null);
  const [hofEndorsementPlayer, setHofEndorsementPlayer] = useState<NBAPlayer | null>(null);
  const [hofEndorsementSubmitted, setHofEndorsementSubmitted] = useState<string | null>(null);
  const [transferInquiry, setTransferInquiry] = useState<{
    player: NBAPlayer;
    inquiry: EuroTransferInquiryState;
  } | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const pbaMode = isPbaIsolatedMode(state);
  const isFictional = state.leagueType === 'fictional';
  const currentYear = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const isRawDraftProspect = React.useCallback(
    (player: NBAPlayer) => player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect',
    [],
  );
  const currentDateNorm = React.useMemo(() => {
    const date = parseGameDate(state.date);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  }, [state.date]);
  const scoutingDraftYear = Number((scoutingPlayer as any)?.draft?.year ?? currentYear);
  const scoutingCombineDate = toISODateString(getDraftCombineStartDate(scoutingDraftYear, state.leagueStats as any));
  const scoutingShowCombineTab = pbaMode || scoutingDraftYear < currentYear || currentDateNorm >= scoutingCombineDate;
  const [gistByYear, setGistByYear] = useState(() => pbaMode || isFictional ? null : getCachedDraftScouting(scoutingDraftYear) ?? null);

  React.useEffect(() => {
    if (!scoutingPlayer) return;
    if (pbaMode || isFictional) {
      setGistByYear(null);
      return;
    }
    const cached = getCachedDraftScouting(scoutingDraftYear);
    if (cached !== undefined) {
      setGistByYear(cached);
      return;
    }
    let cancelled = false;
    ensureDraftScouting(scoutingDraftYear).then(data => {
      if (!cancelled) setGistByYear(data);
    });
    return () => { cancelled = true; };
  }, [isFictional, pbaMode, scoutingPlayer, scoutingDraftYear]);

  const pbaTeamIds = React.useMemo(
    () => new Set((state.nonNBATeams ?? []).filter((team: any) => team.league === 'PBA').map((team: any) => Number(team.tid ?? team.id))),
    [state.nonNBATeams],
  );

  const scoutingClassProspects = React.useMemo(() => {
    if (!scoutingPlayer) return [] as NBAPlayer[];
    if (pbaMode) return getPbaDraftPool(state.players, scoutingDraftYear, state.leagueStats as any);
    return state.players.filter(player =>
      (!isFictional || !isExternalLeaguePlayer(player)) &&
      isDraftProspectLike(player, currentYear) &&
      Number((player as any).draft?.year ?? scoutingDraftYear) === scoutingDraftYear,
    );
  }, [isFictional, pbaMode, scoutingPlayer, state.players, currentYear, scoutingDraftYear, state.leagueStats]);

  const scoutingActivePlayers = React.useMemo(() =>
    state.players.filter(player =>
      (pbaMode ? pbaTeamIds.has(player.tid) : player.tid >= 0 && player.tid < 100) &&
      isOnRoster(player) &&
      (pbaMode ? !isRawDraftProspect(player) : !isDraftProspectLike(player, currentYear)),
    ),
  [pbaMode, pbaTeamIds, state.players, currentYear, isRawDraftProspect]);

  const scoutingBatchComps = React.useMemo(
    () => batchComparisonsDeduped(scoutingClassProspects, scoutingActivePlayers, 3, 3, pbaMode ? 'pba' : 'nba'),
    [scoutingClassProspects, scoutingActivePlayers, pbaMode],
  );

  const scoutingGistMatch = React.useMemo(
    () => scoutingPlayer ? matchProspectToGist(scoutingPlayer, gistByYear) : null,
    [scoutingPlayer, gistByYear],
  );

  const scoutingRanks = React.useMemo(() => {
    if (!scoutingPlayer || !gistByYear?.length || !scoutingGistMatch) return undefined;
    const consensusIndex = gistByYear.findIndex(entry => entry.id === scoutingGistMatch.id);
    const espn = scoutingGistMatch.externalRanks?.espn ? parseInt(scoutingGistMatch.externalRanks.espn, 10) : undefined;
    const noCeilings = scoutingGistMatch.externalRanks?.noCeilings ? parseInt(scoutingGistMatch.externalRanks.noCeilings, 10) : undefined;
    return {
      consensus: consensusIndex >= 0 ? consensusIndex + 1 : undefined,
      espn: Number.isFinite(espn) ? espn : undefined,
      noCeilings: Number.isFinite(noCeilings) ? noCeilings : undefined,
    };
  }, [scoutingPlayer, gistByYear, scoutingGistMatch]);

  const closeSigning = () => {
    setSigningPlayer(null);
    setResignTeamId(null);
    setForceContractType(undefined);
  };

  /** Open the PlayerActionsModal for a given player — call this from any row onClick. */
  const openFor = (player: NBAPlayer, context: 'default' | 'draft-scouting' | 'retirement-review' = 'default') => {
    setActionsContext(context);
    setActionsPlayer(player);
  };

  /** Dispatch-only handler for the lightweight sign/resign/waive actions. Returns true if handled. */
  const handle = (player: NBAPlayer, actionType: string): boolean => {
    if (
      (actionType === 'add_trade_target' || actionType === 'remove_trade_target')
      && state.gameMode === 'gm'
      && state.userTeamId != null
    ) {
      updateTradingBlock(state.userTeamId, entry => {
        const targetIds = new Set(entry.targetIds);
        if (actionType === 'remove_trade_target') targetIds.delete(player.internalId);
        else if (targetIds.size < 10) targetIds.add(player.internalId);
        return { ...entry, targetIds: Array.from(targetIds) };
      });
      return true;
    }
    if (actionType === 'endorse_hof') {
      if (state.gameMode === 'gm') return false;
      setHofEndorsementPlayer(player);
      return true;
    }
    if (personActions.open(player, actionType)) return true;
    if (actionType === 'view_scouting') {
      if (pbaMode ? isRawDraftProspect(player) : isDraftProspectLike(player, currentYear)) {
        setScoutingPlayer(player);
        return true;
      }
      return false;
    }
    if (actionType === 'sign_player') {
      const faStartLabel = getPlayerPreFreeAgencyStartLabel(state, player);
      if (faStartLabel && state.gameMode === 'gm') {
        setBlockedMessage(`Free agency has not opened yet. You can view the pool now, but offers start on ${faStartLabel}.`);
        return true;
      }
      if (isPbaIsolatedMode(state) && state.userTeamId != null) {
        const check = canSignInCurrentPbaWindow(player, state.userTeamId, state as any);
        if (!check.allowed) {
          setBlockedMessage(check.reason!);
          return true;
        }
      }
      setSigningPlayer(player);
      setResignTeamId(null);
      setForceContractType(undefined);
      return true;
    }
    if (actionType === 'resign_player') {
      setSigningPlayer(player);
      setResignTeamId(player.tid ?? null);
      setForceContractType(undefined);
      return true;
    }
    if (actionType === 'sign_guaranteed') {
      // 2W → standard promotion: reuse the SigningModal (team locked to current team, GUARANTEED tab forced).
      // SIGN_FREE_AGENT pushes a 'Signing' history entry via gameLogic.ts, so TransactionsView picks it up automatically.
      setSigningPlayer(player);
      setResignTeamId(player.tid ?? null);
      setForceContractType('GUARANTEED');
      return true;
    }
    if (actionType === 'view_fa_offers') {
      setOffersPlayer(player);
      return true;
    }
    if (actionType === 'convert_to_guaranteed') {
      // NG → Guaranteed is an in-place flag flip — don't run it through
      // SIGN_FREE_AGENT (which calls advanceDay and sims a day). Existing
      // salary/years stay; team just commits to the deal.
      dispatchAction({
        type: 'CONVERT_CONTRACT_TYPE',
        payload: { playerId: player.internalId, to: 'GUARANTEED' },
      } as any);
      return true;
    }
    if (actionType === 'trade_player') {
      // Hand off to TradeFinderView via a transient state slot. The view reads
      // this on mount, sets selectedTid + drops the player into the basket,
      // then clears the slot so the next visit doesn't repeat.
      if (player.tid != null && player.tid >= 0) {
        dispatchAction({
          type: 'UPDATE_STATE',
          payload: {
            tradeFinderPreselect: { tid: player.tid, playerId: player.internalId },
          },
        } as any);
        setCurrentView('Trade Finder' as any);
      }
      return true;
    }
    if (actionType === 'open_transfer_market') {
      const isOwnEuroRosterPlayer =
        state.gameMode === 'gm' &&
        state.leagueStats?.uiMode === 'euro_isolated' &&
        state.userTeamId != null &&
        player.tid === state.userTeamId &&
        isOnRoster(player);
      if (!isOwnEuroRosterPlayer) return true;
      if (!isTransferWindowOpen(state.date, state.leagueStats)) {
        setBlockedMessage('The transfer window is closed right now.');
        return true;
      }
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingTransferListingPlayerId: player.internalId },
      } as any);
      setCurrentView('Front Office Transfer Market' as any);
      return true;
    }
    if (actionType === 'inquire_transfer') {
      const seller = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? []);
      const eligible =
        state.gameMode === 'gm' &&
        state.leagueStats?.uiMode === 'euro_isolated' &&
        state.userTeamId != null &&
        player.tid !== state.userTeamId &&
        isOnRoster(player) &&
        isTransferMarketEligibleTeam(seller) &&
        !(state.loanAgreements ?? []).some(agreement => agreement.status === 'active' && agreement.playerId === player.internalId);
      if (!eligible) return true;
      if (!isTransferWindowOpen(state.date, state.leagueStats)) {
        setBlockedMessage('The transfer window is closed right now.');
        return true;
      }
      const inquiry = getEuroTransferInquiryState(state, player);
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          euroTransferAvailability: {
            ...(state.euroTransferAvailability ?? {}),
            [player.internalId]: inquiry,
          },
        },
      } as any);
      setTransferInquiry({ player, inquiry });
      return true;
    }
    if (actionType === 'open_loan_market') {
      const isOwnEuroRosterPlayer =
        state.gameMode === 'gm' &&
        state.leagueStats?.uiMode === 'euro_isolated' &&
        state.userTeamId != null &&
        player.tid === state.userTeamId &&
        isOnRoster(player);
      if (!isOwnEuroRosterPlayer) return true;
      if (!isInLoanWindow(state.date, state.leagueStats).open) {
        setBlockedMessage('The loan window is closed right now.');
        return true;
      }
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: { pendingLoanListingPlayerId: player.internalId },
      } as any);
      setCurrentView('Front Office Transfer Market' as any);
      return true;
    }
    if (actionType === 'convert_to_twoway') {
      // NG → Two-Way: in-place downgrade ($625K/1yr scale). Direct dispatch —
      // no SigningModal, no day sim.
      const maxTwoWay = getTwoWayRosterLimit(state.leagueStats as any);
      if (!areTwoWayContractsEnabled(state.leagueStats) || maxTwoWay <= 0) return true;
      dispatchAction({
        type: 'CONVERT_CONTRACT_TYPE',
        payload: { playerId: player.internalId, to: 'TWO_WAY' },
      } as any);
      return true;
    }
    if (actionType === 'waive') {
      // League-minimum roster guard: a waive that drops the team below
      // leagueStats.minPlayersPerTeam is blocked. Two-way contracts don't
      // count toward the standard-roster floor (same convention the AI
      // handler and trim logic use).
      const tid = player.tid;
      if (tid != null && tid >= 0) {
        const minRoster = state.leagueStats?.minPlayersPerTeam ?? 14;
        const twoWayContractsActive = tid < 100 && getTwoWayRosterLimit(state.leagueStats as any) > 0;
        const isActiveTwoWay = (p: NBAPlayer) => twoWayContractsActive && isTwoWayContract(p, state.leagueStats);
        const standardCount = state.players.filter(p =>
          p.tid === tid && !isActiveTwoWay(p) && isOnRoster(p)
        ).length;
        const isStandardPlayer = !isActiveTwoWay(player);
        const afterWaive = standardCount - (isStandardPlayer ? 1 : 0);
        if (isStandardPlayer && afterWaive < minRoster) {
          const teamName = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? [])?.name ?? 'This team';
          setBlockedMessage(
            `${teamName} is at the minimum roster size (${minRoster}). Waiving ${player.name} would drop the roster to ${afterWaive} — sign another player first.`
          );
          return true;
        }
      }
      // Open the dead-money preview modal so user sees cap impact / stretch option
      // before pulling the trigger. The modal dispatches WAIVE_PLAYER on confirm.
      setWaivePlayer(player);
      return true;
    }
    return false;
  };

  /** Route an action selection from PlayerActionsModal. Handles all three built-in action types + bio/ratings. */
  const onActionSelect = (actionType: string) => {
    if (!actionsPlayer) return;
    if (actionType === 'replace_all_star') {
      setAllStarReplacementPlayer(actionsPlayer);
      setActionsPlayer(null);
      return;
    }
    if (actionType === 'view_bio') {
      navigateToPlayer(actionsPlayer);
      setActionsPlayer(null);
      return;
    }
    if (actionType === 'view_ratings') {
      setRatingsPlayer(actionsPlayer);
      setActionsPlayer(null);
      return;
    }
    if (handle(actionsPlayer, actionType)) {
      setActionsPlayer(null);
      return;
    }
    setActionsPlayer(null);
  };

  const portals = (
    <>
      {personActions.portals}
      {hofEndorsementPlayer && (
        <HallOfFameEndorsementConfirmModal
          playerName={hofEndorsementPlayer.name}
          onCancel={() => setHofEndorsementPlayer(null)}
          onConfirm={() => {
            const player = hofEndorsementPlayer;
            const contact = getContactFromPlayer(player, state);
            setHofEndorsementPlayer(null);
            void dispatchAction({
              type: 'ENDORSE_HOF',
              payload: {
                targetName: player.name,
                targetRole: contact.title,
                targetId: player.internalId,
                count: 1,
                subType: 'endorse_hof',
                contacts: [contact],
              },
            } as any).then(() => setHofEndorsementSubmitted(player.name));
          }}
        />
      )}
      {hofEndorsementSubmitted && (
        <HallOfFameEndorsementSubmittedModal
          playerName={hofEndorsementSubmitted}
          onDone={() => setHofEndorsementSubmitted(null)}
        />
      )}
      {actionsPlayer && (
        <PlayerActionsModal
          player={actionsPlayer}
          context={actionsContext}
          onClose={() => setActionsPlayer(null)}
          onActionSelect={onActionSelect}
          onHeal={() => healPlayer(actionsPlayer.internalId)}
        />
      )}
      {ratingsPlayer && (
        <PlayerRatingsModal
          player={ratingsPlayer}
          season={state.leagueStats?.year ?? new Date().getFullYear()}
          onClose={() => setRatingsPlayer(null)}
        />
      )}
      {allStarReplacementPlayer && (
        <AllStarReplacementModal
          initialInjuredPlayerId={allStarReplacementPlayer.internalId}
          onClose={() => setAllStarReplacementPlayer(null)}
          onConfirm={async (injuredId, _injuredName, replacementId, _replacementName, conference) => {
            await dispatchAction({
              type: 'ADD_ALL_STAR_REPLACEMENT',
              payload: { injuredId, replacementId, conference },
            } as any);
            setAllStarReplacementPlayer(null);
          }}
        />
      )}
      {scoutingPlayer && (
        <DraftScoutingModal
          player={scoutingPlayer}
          onClose={() => setScoutingPlayer(null)}
          classProspects={scoutingClassProspects}
          activePlayers={scoutingActivePlayers}
          draftYear={scoutingDraftYear}
          gistData={scoutingGistMatch}
          ranks={scoutingRanks}
          preComputedComps={scoutingBatchComps.get(scoutingPlayer.internalId)}
          onViewPlayerBio={(player) => {
            setScoutingPlayer(null);
            navigateToPlayer(player);
          }}
          showCombineTab={scoutingShowCombineTab}
        />
      )}
      {offersPlayer && (
        <FAOffersModal
          player={offersPlayer}
          onClose={() => setOffersPlayer(null)}
          onContactAgent={() => {
            const playerId = offersPlayer.internalId;
            setOffersPlayer(null);
            dispatchAction({
              type: 'UPDATE_STATE',
              payload: { pendingFreeAgentAgentContact: { playerId } },
            } as any);
            setCurrentView('Messages' as any);
          }}
        />
      )}
      {waivePlayer && (
        <WaiveConfirmModal
          player={waivePlayer}
          team={resolveAnyTeam(waivePlayer.tid, state.teams, state.nonNBATeams ?? []) ?? undefined}
          state={state}
          onClose={() => setWaivePlayer(null)}
          onConfirm={({ stretch }) => {
            const p = waivePlayer;
            setWaivePlayer(null);
            dispatchAction({
              type: 'WAIVE_PLAYER',
              payload: {
                targetId: p.internalId,
                targetName: p.name,
                contacts: [{ id: p.internalId, name: p.name, type: 'player' }],
                stretch,
              },
            });
          }}
        />
      )}
      {signingPlayer && (
        <SignFreeAgentModal
          initialPlayer={signingPlayer}
          initialTeam={resignTeamId != null ? resolveAnyTeam(resignTeamId, state.teams, state.nonNBATeams ?? []) ?? undefined : undefined}
          forceContractType={forceContractType}
          onClose={closeSigning}
          onConfirm={async (payload) => {
            closeSigning();
            console.log('[quickActions] SIGN_FREE_AGENT dispatch', payload);
            await dispatchAction({ type: 'SIGN_FREE_AGENT', payload });
          }}
        />
      )}
      {transferInquiry && (
        <EuroPlayerInquiryModal
          player={transferInquiry.player}
          inquiry={transferInquiry.inquiry}
          onClose={() => setTransferInquiry(null)}
          onSubmit={input => {
            dispatchAction({
              type: 'SUBMIT_TRANSFER_BID',
              payload: {
                ...input,
                playerId: transferInquiry.player.internalId,
                bidderTid: state.userTeamId,
                privateInquiry: true,
                validDays: 5,
              },
            } as any);
            setTransferInquiry(null);
          }}
        />
      )}
      <AnimatePresence>
        {blockedMessage && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => setBlockedMessage(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#0f0f0f] border border-rose-500/30 rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-rose-500/[0.05]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">Action Blocked</h3>
                </div>
                <button onClick={() => setBlockedMessage(null)} className="text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-300 leading-relaxed">{blockedMessage}</p>
                <button
                  onClick={() => setBlockedMessage(null)}
                  className="mt-4 w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  const fullPageView = null;

  const isOverlayOpen = !!(
    actionsPlayer
    || ratingsPlayer
    || scoutingPlayer
    || signingPlayer
    || offersPlayer
    || waivePlayer
    || allStarReplacementPlayer
    || transferInquiry
    || blockedMessage
    || hofEndorsementPlayer
    || hofEndorsementSubmitted
  );

  const openBio = (player: NBAPlayer | null) => player ? navigateToPlayer(player) : closeDeepLink();
  return { openFor, openBio, handle, portals, fullPageView, isOverlayOpen };
}
