import React, { useState } from 'react';
import { useGame } from '../store/GameContext';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { PlayerActionsModal } from '../components/central/view/PlayerActionsModal';
import { PlayerRatingsModal } from '../components/modals/PlayerRatingsModal';
import { PlayerBioView } from '../components/central/view/PlayerBioView';
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
  const { state, dispatchAction, healPlayer } = useGame();

  const [actionsPlayer, setActionsPlayer] = useState<NBAPlayer | null>(null);
  const [ratingsPlayer, setRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [bioPlayer, setBioPlayer] = useState<NBAPlayer | null>(null);
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
  const [resignTeamId, setResignTeamId] = useState<number | null>(null);

  const closeSigning = () => {
    setSigningPlayer(null);
    setResignTeamId(null);
  };

  /** Open the PlayerActionsModal for a given player — call this from any row onClick. */
  const openFor = (player: NBAPlayer) => setActionsPlayer(player);

  /** Dispatch-only handler for the lightweight sign/resign/waive actions. Returns true if handled. */
  const handle = (player: NBAPlayer, actionType: string): boolean => {
    if (actionType === 'sign_player') {
      setSigningPlayer(player);
      setResignTeamId(null);
      return true;
    }
    if (actionType === 'resign_player') {
      setSigningPlayer(player);
      setResignTeamId(player.tid ?? null);
      return true;
    }
    if (actionType === 'waive') {
      dispatchAction({
        type: 'WAIVE_PLAYER',
        payload: {
          targetId: player.internalId,
          targetName: player.name,
          contacts: [{ id: player.internalId, name: player.name, type: 'player' }],
        },
      });
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
      {signingPlayer && (
        <SignFreeAgentModal
          initialPlayer={signingPlayer}
          initialTeam={resignTeamId != null ? state.teams.find(t => t.id === resignTeamId) ?? undefined : undefined}
          onClose={closeSigning}
          onConfirm={async (payload) => {
            closeSigning();
            await dispatchAction({ type: 'SIGN_FREE_AGENT', payload });
          }}
        />
      )}
    </>
  );

  // PlayerBioView is a full-page takeover — parents render this in place of their normal content.
  const fullPageView = bioPlayer
    ? <PlayerBioView player={bioPlayer} onBack={() => setBioPlayer(null)} />
    : null;

  return { openFor, handle, portals, fullPageView };
}
