import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { PlayerActionsModal } from '../components/central/view/PlayerActionsModal';
import { PlayerRatingsModal } from '../components/modals/PlayerRatingsModal';
import { PlayerBioView } from '../components/central/view/PlayerBioView';
import { FAOffersModal } from '../components/modals/FAOffersModal';
import { WaiveConfirmModal } from '../components/modals/WaiveConfirmModal';
import type { NBAPlayer } from '../types';

/**
 * Unified "click a player name" handler — one hook that owns the entire modal stack:
 *   • PlayerActionsModal           (the quick-actions menu)
 *   • PlayerRatingsModal           (from "View Ratings")
 *   • PlayerBioView (full page)    (from "View Bio")
 *   • SignFreeAgentModal           (from "Sign Free Agent" / "Re-sign Player")
 *   • WAIVE_PLAYER dispatch        (from "Waive")
 *
 * Usage in any list view:
 *   const quick = usePlayerQuickActions();
 *   ...
 *   <tr onClick={() => quick.openFor(player)}>...</tr>
 *   ...
 *   // `fullPageView` takes over the whole view when PlayerBioView is active.
 *   return quick.fullPageView ?? (<>
 *     <MyTableUI />
 *     {quick.portals}
 *   </>);
 */
export function usePlayerQuickActions() {
  const { state, dispatchAction, healPlayer, setCurrentView } = useGame();

  const [actionsPlayer, setActionsPlayer] = useState<NBAPlayer | null>(null);
  const [ratingsPlayer, setRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [bioPlayer, setBioPlayer] = useState<NBAPlayer | null>(null);
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
  const [resignTeamId, setResignTeamId] = useState<number | null>(null);
  const [forceContractType, setForceContractType] = useState<'GUARANTEED' | 'TWO_WAY' | undefined>(undefined);
  const [offersPlayer, setOffersPlayer] = useState<NBAPlayer | null>(null);
  const [waivePlayer, setWaivePlayer] = useState<NBAPlayer | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const closeSigning = () => {
    setSigningPlayer(null);
    setResignTeamId(null);
    setForceContractType(undefined);
  };

  /** Open the PlayerActionsModal for a given player — call this from any row onClick. */
  const openFor = (player: NBAPlayer) => setActionsPlayer(player);

  /** Dispatch-only handler for the lightweight sign/resign/waive actions. Returns true if handled. */
  const handle = (player: NBAPlayer, actionType: string): boolean => {
    if (actionType === 'sign_player') {
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
    if (actionType === 'convert_to_twoway') {
      // NG → Two-Way: in-place downgrade ($625K/1yr scale). Direct dispatch —
      // no SigningModal, no day sim.
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
        const standardCount = state.players.filter(p =>
          p.tid === tid && !(p as any).twoWay && p.status === 'Active'
        ).length;
        const isStandardPlayer = !(player as any).twoWay;
        const afterWaive = standardCount - (isStandardPlayer ? 1 : 0);
        if (isStandardPlayer && afterWaive < minRoster) {
          const teamName = state.teams.find(t => t.id === tid)?.name ?? 'This team';
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
    if (actionType === 'view_bio') {
      setBioPlayer(actionsPlayer);
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
      {actionsPlayer && (
        <PlayerActionsModal
          player={actionsPlayer}
          onClose={() => setActionsPlayer(null)}
          onActionSelect={onActionSelect}
          onHeal={() => { healPlayer(actionsPlayer.internalId); setActionsPlayer(null); }}
        />
      )}
      {ratingsPlayer && (
        <PlayerRatingsModal
          player={ratingsPlayer}
          season={state.leagueStats?.year ?? new Date().getFullYear()}
          onClose={() => setRatingsPlayer(null)}
        />
      )}
      {offersPlayer && (
        <FAOffersModal
          player={offersPlayer}
          onClose={() => setOffersPlayer(null)}
        />
      )}
      {waivePlayer && (
        <WaiveConfirmModal
          player={waivePlayer}
          team={state.teams.find(t => t.id === waivePlayer.tid)}
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
          initialTeam={resignTeamId != null ? state.teams.find(t => t.id === resignTeamId) ?? undefined : undefined}
          forceContractType={forceContractType}
          onClose={closeSigning}
          onConfirm={async (payload) => {
            closeSigning();
            await dispatchAction({ type: 'SIGN_FREE_AGENT', payload });
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

  // PlayerBioView is a full-page takeover — parents render this in place of their normal content.
  const fullPageView = bioPlayer
    ? <PlayerBioView player={bioPlayer} onBack={() => setBioPlayer(null)} />
    : null;

  return { openFor, handle, portals, fullPageView };
}
