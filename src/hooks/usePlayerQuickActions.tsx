import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { PlayerActionsModal } from '../components/shared/PlayerActionsModal';
import { PlayerRatingsModal } from '../components/modals/PlayerRatingsModal';
import { PlayerBioView } from '../components/central/view/PlayerBioView';
import { DraftScoutingModal } from '../components/draft/DraftScoutingModal';
import { FAOffersModal } from '../components/modals/FAOffersModal';
import { WaiveConfirmModal } from '../components/modals/WaiveConfirmModal';
import type { NBAPlayer } from '../types';
import { formatGameDateShort, getCurrentOffseasonEffectiveFAStart, getDraftCombineStartDate, parseGameDate, toISODateString } from '../utils/dateUtils';
import { isOnRoster, resolveAnyTeam } from '../utils/teamLookup';
import { isPbaIsolatedMode } from '../utils/uiMode';
import { isTransferWindowOpen } from '../utils/transferWindow';
import { canSignInPba, getEffectivePbaConference, isFilipino } from '../services/pba/importManager';
import { isDraftProspectLike } from '../utils/prospectUtils';
import {
  getClassPercentiles,
  getClassAverages,
  batchComparisonsDeduped,
  type ClassPercentileMaps,
} from '../services/scoutingReport';
import {
  ensureDraftScouting,
  getCachedDraftScouting,
  matchProspectToGist,
} from '../services/draftScoutingGist';

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
  const [scoutingPlayer, setScoutingPlayer] = useState<NBAPlayer | null>(null);
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
  const [resignTeamId, setResignTeamId] = useState<number | null>(null);
  const [forceContractType, setForceContractType] = useState<'GUARANTEED' | 'TWO_WAY' | undefined>(undefined);
  const [offersPlayer, setOffersPlayer] = useState<NBAPlayer | null>(null);
  const [waivePlayer, setWaivePlayer] = useState<NBAPlayer | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const pbaMode = isPbaIsolatedMode(state);
  const currentYear = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const currentDateNorm = React.useMemo(() => {
    const date = parseGameDate(state.date);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  }, [state.date]);
  const scoutingDraftYear = Number((scoutingPlayer as any)?.draft?.year ?? currentYear);
  const scoutingCombineDate = toISODateString(getDraftCombineStartDate(scoutingDraftYear, state.leagueStats as any));
  const scoutingShowCombineTab = pbaMode || scoutingDraftYear < currentYear || currentDateNorm >= scoutingCombineDate;
  const [gistByYear, setGistByYear] = useState(() => pbaMode ? null : getCachedDraftScouting(scoutingDraftYear) ?? null);

  React.useEffect(() => {
    if (!scoutingPlayer) return;
    if (pbaMode) {
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
  }, [pbaMode, scoutingPlayer, scoutingDraftYear]);

  const pbaTeamIds = React.useMemo(
    () => new Set((state.nonNBATeams ?? []).filter((team: any) => team.league === 'PBA').map((team: any) => Number(team.tid ?? team.id))),
    [state.nonNBATeams],
  );

  const scoutingClassProspects = React.useMemo(() => {
    if (!scoutingPlayer) return [] as NBAPlayer[];
    return state.players.filter(player =>
      isDraftProspectLike(player, currentYear) &&
      (!pbaMode || isFilipino(player)) &&
      Number((player as any).draft?.year ?? scoutingDraftYear) === scoutingDraftYear,
    );
  }, [pbaMode, scoutingPlayer, state.players, currentYear, scoutingDraftYear]);

  const scoutingActivePlayers = React.useMemo(() =>
    state.players.filter(player =>
      (pbaMode ? pbaTeamIds.has(player.tid) : player.tid >= 0 && player.tid < 100) &&
      isOnRoster(player) &&
      !isDraftProspectLike(player, currentYear),
    ),
  [pbaMode, pbaTeamIds, state.players, currentYear]);

  const scoutingClassAverages = React.useMemo(
    () => getClassAverages(scoutingClassProspects),
    [scoutingClassProspects],
  );

  const scoutingPercentilesByPos = React.useMemo(() => {
    const map = new Map<string, ClassPercentileMaps>();
    map.set('Guard', getClassPercentiles(scoutingClassProspects, 'Guard'));
    map.set('Forward', getClassPercentiles(scoutingClassProspects, 'Forward'));
    map.set('Center', getClassPercentiles(scoutingClassProspects, 'Center'));
    map.set('Class', getClassPercentiles(scoutingClassProspects, 'Class'));
    return map;
  }, [scoutingClassProspects]);

  const scoutingBatchComps = React.useMemo(
    () => batchComparisonsDeduped(scoutingClassProspects, scoutingActivePlayers),
    [scoutingClassProspects, scoutingActivePlayers],
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
  const openFor = (player: NBAPlayer) => setActionsPlayer(player);

  const isBeforeFreeAgencyOpen = (player: NBAPlayer): string | null => {
    if (player.tid !== -1 && player.status !== 'Free Agent') return null;
    if (!state.date) return null;
    const current = parseGameDate(state.date);
    const year = current.getUTCFullYear();
    const faMonth = (state.leagueStats?.faStartMonth ?? 7) - 1; // 0-indexed for Date.UTC
    const faDay = state.leagueStats?.faStartDay ?? 1;
    // FA already opened this calendar year → allow (handles Oct–Dec post-FA)
    if (current >= new Date(Date.UTC(year, faMonth, faDay))) return null;
    // FA opened last calendar year → allow (handles Jan–Jun regular season)
    if (current >= new Date(Date.UTC(year - 1, faMonth, faDay))) return null;
    const faStart = getCurrentOffseasonEffectiveFAStart(current, state.leagueStats as any, state.schedule as any);
    return current < faStart ? formatGameDateShort(faStart) : null;
  };

  /** Dispatch-only handler for the lightweight sign/resign/waive actions. Returns true if handled. */
  const handle = (player: NBAPlayer, actionType: string): boolean => {
    if (actionType === 'view_scouting') {
      if (isDraftProspectLike(player, currentYear)) {
        setScoutingPlayer(player);
        return true;
      }
      return false;
    }
    if (actionType === 'sign_player') {
      const faStartLabel = isBeforeFreeAgencyOpen(player);
      if (faStartLabel && state.gameMode === 'gm') {
        setBlockedMessage(`Free agency has not opened yet. You can view the pool now, but offers start on ${faStartLabel}.`);
        return true;
      }
      if (isPbaIsolatedMode(state) && state.userTeamId != null) {
        const check = canSignInPba(player, state.userTeamId, getEffectivePbaConference(state.leagueStats as any), state.players, state.leagueStats as any);
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
          p.tid === tid && !(p as any).twoWay && isOnRoster(p)
        ).length;
        const isStandardPlayer = !(player as any).twoWay;
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
      {scoutingPlayer && (
        <DraftScoutingModal
          player={scoutingPlayer}
          onClose={() => setScoutingPlayer(null)}
          classProspects={scoutingClassProspects}
          activePlayers={scoutingActivePlayers}
          percentilesByPos={scoutingPercentilesByPos}
          classAverages={scoutingClassAverages}
          draftYear={scoutingDraftYear}
          gistData={scoutingGistMatch}
          ranks={scoutingRanks}
          preComputedComps={scoutingBatchComps.get(scoutingPlayer.internalId)}
          onViewPlayerBio={(player) => {
            setScoutingPlayer(null);
            setBioPlayer(player);
          }}
          showCombineTab={scoutingShowCombineTab}
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
