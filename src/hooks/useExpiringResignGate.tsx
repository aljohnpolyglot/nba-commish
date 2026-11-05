import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/GameContext';
import { ExpiringResignGateModal, ExpiringRow, ResignIntentLabel } from '../components/modals/ExpiringResignGateModal';
import { SignFreeAgentModal } from '../components/modals/SignFreeAgentModal';
import { getCurrentOffseasonEffectiveFAStart } from '../utils/dateUtils';
import { normalizeDate } from '../utils/helpers';
import { computeContractOffer, contractToUSD, getCapThresholds, getContractLimits, hasBirdRights } from '../utils/salaryUtils';
import { computeMoodScore, normalizeMoodTraits } from '../utils/mood/moodScore';
import { classifyResignIntent } from '../components/central/view/PlayerBioMoraleTab';
import type { NBAPlayer } from '../types';
import { resolveAnyTeam } from '../utils/teamLookup';
import { getTwoWayRosterLimit } from '../utils/rosterLimits';
import { isTwoWayContract } from '../utils/contractTypes';
import {
  getExpiringContractReviewSeason,
  getExpiringContractPlayers,
  isExpiringContractBoardReviewed,
} from '../services/freeAgency/expiringContractBoard';
import {
  isReSignDecision,
  resolveOffseasonContractDecision,
} from '../services/freeAgency/offseasonContractDecision';

interface ExpiringResignGateOptions {
  onNavigateManual?: () => void;
  onReviewComplete?: () => void | Promise<void>;
}

export function useExpiringResignGate(options: ExpiringResignGateOptions = {}) {
  const { state, dispatchAction } = useGame();
  const [open, setOpen] = useState(false);
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [signingPlayer, setSigningPlayer] = useState<NBAPlayer | null>(null);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const rows = useMemo<ExpiringRow[]>(() => {
    if (state.userTeamId == null) return [];
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const team = resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []);
    if (!team) return [];
    const gp = (team?.wins ?? 0) + (team?.losses ?? 0);
    const winPct = gp > 0 ? (team?.wins ?? 0) / gp : 0.5;
    const teamPlayers = state.players.filter((p: any) => p.tid === state.userTeamId);
    const birdRightsEnabled = state.leagueStats?.birdRightsEnabled !== false;
    const twoWayContractsEnabled = getTwoWayRosterLimit(state.leagueStats as any) > 0;
    const getResignBlockReason = (player: NBAPlayer, salaryUSD: number): string | undefined => {
      if (state.leagueStats?.uiMode === 'euro_isolated') return undefined;
      if (birdRightsEnabled && hasBirdRights(player)) return undefined;
      const limits = getContractLimits(player, state.leagueStats as any);
      if (salaryUSD <= limits.minSalaryUSD * 1.05) return undefined;
      const newDealStartYear = currentYear + 1;
      const committedAtStartYear = state.players
        .filter((p: any) =>
          p.tid === state.userTeamId &&
          (!twoWayContractsEnabled || !isTwoWayContract(p, state.leagueStats)) &&
          (p.contract?.exp ?? newDealStartYear) >= newDealStartYear &&
          p.internalId !== player.internalId
        )
        .reduce((sum: number, p: any) => sum + contractToUSD(p.contract?.amount || 0), 0);
      const thresholds = getCapThresholds(state.leagueStats as any);
      if (committedAtStartYear + salaryUSD <= thresholds.salaryCap) return undefined;
      return 'CBA restriction: no Bird rights / no cap room for asking price';
    };

    return getExpiringContractPlayers(state, state.userTeamId)
      .map((p: any) => {
        const decision = resolveOffseasonContractDecision(p, state);
        const traits = normalizeMoodTraits(p.moodTraits ?? []);
        const { score } = computeMoodScore(p, team as any, state.date, false, false, false, teamPlayers, currentYear);
        const intent = isReSignDecision(decision.kind)
          ? classifyResignIntent(p, traits, score, currentYear, winPct) as ResignIntentLabel
          : 'not_expiring' as const;
        const offer = computeContractOffer(p, state.leagueStats as any, traits as any, score);
        return {
          player: p,
          intent,
          decisionKind: decision.kind,
          offerSalaryUSD: offer.salaryUSD,
          offerYears: offer.years,
          resignBlockReason: intent === 'ready_to_extend' || intent === 'open'
            ? getResignBlockReason(p, offer.salaryUSD)
            : undefined,
        };
      });
  }, [state, state.userTeamId, state.players, state.teams, state.nonNBATeams, state.leagueStats, state.date]);

  const reviewed = useMemo(
    () => isExpiringContractBoardReviewed(state, rows.map(row => row.player)),
    [state.expiringPlayersReview, state.leagueStats, rows],
  );

  const allResolved = useMemo(() => (
    rows.every(r =>
      offeredIds.has(r.player.internalId) ||
      rejectedIds.has(r.player.internalId) ||
      !!r.resignBlockReason ||
      !(r.intent === 'ready_to_extend' || r.intent === 'open')
    )
  ), [rows, offeredIds, rejectedIds]);

  const actionableCount = useMemo(
    () => rows.filter(r =>
      (r.intent === 'ready_to_extend' || r.intent === 'open') &&
      !r.resignBlockReason
    ).length,
    [rows],
  );

  const wouldCrossFAOpenDeadline = (targetDate?: string) => {
    if (!state.date || rows.length === 0) return false;
    const today = normalizeDate(state.date);
    const target = targetDate ? normalizeDate(targetDate) : today;
    const faStart = normalizeDate(getCurrentOffseasonEffectiveFAStart(`${today}T00:00:00Z`, state.leagueStats as any, state.schedule as any).toISOString());
    if (today >= faStart) return false;
    return target >= faStart;
  };

  const attempt = (fn: () => void | Promise<void>, targetDate?: string) => {
    if (wouldCrossFAOpenDeadline(targetDate)) {
      pendingRef.current = fn;
      setOpen(true);
      return false;
    }
    void fn();
    return true;
  };

  const handleAssistant = async () => {
    const offers = rows
      .filter(row => (
        (row.intent === 'ready_to_extend' || row.intent === 'open')
        && !row.resignBlockReason
        && !offeredIds.has(row.player.internalId)
        && !rejectedIds.has(row.player.internalId)
      ))
      .map(row => ({
        playerId: row.player.internalId,
        salaryUSD: row.offerSalaryUSD,
        years: row.offerYears,
      }));
    await dispatchAction({
      type: 'ASSISTANT_RESIGN_EXPIRING_CONTRACTS',
      payload: {
        teamId: state.userTeamId,
        season: getExpiringContractReviewSeason(state),
        offers,
        reviewedPlayerIds: rows.map(row => row.player.internalId),
      },
    });
    await options.onReviewComplete?.();
    if (!mountedRef.current) return;
    setOfferedIds(new Set());
    setRejectedIds(new Set());
    setOpen(false);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) await pending();
  };

  const handleMakeOffer = (playerId: string) => {
    const row = rows.find(r => r.player.internalId === playerId);
    if (!row) return;
    if (row.resignBlockReason) return;
    setSigningPlayer(row.player);
  };

  const handleReject = (playerId: string) => {
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const player = state.players.find(p => p.internalId === playerId);
    if (player && (player.contract?.exp ?? currentYear + 1) <= currentYear) {
      dispatchAction({
        type: 'UPDATE_STATE' as any,
        payload: {
          players: state.players.map((p: any) => p.internalId === playerId ? {
            ...p,
            tid: -1,
            status: 'Free Agent',
            midSeasonExtensionDeclined: true,
            twoWay: undefined,
            nonGuaranteed: false,
            gLeagueAssigned: false,
            signedDate: undefined,
            tradeEligibleDate: undefined,
            yearsWithTeam: 0,
          } : p),
        },
      } as any);
    }
    setRejectedIds(prev => {
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  };

  const handleManual = () => {
    pendingRef.current = null;
    setOfferedIds(new Set());
    setRejectedIds(new Set());
    setOpen(false);
    options.onNavigateManual?.();
  };

  const handleDismiss = () => {
    pendingRef.current = null;
    setOfferedIds(new Set());
    setRejectedIds(new Set());
    setOpen(false);
  };

  const userTeam = resolveAnyTeam(state.userTeamId ?? -1, state.teams, state.nonNBATeams ?? []);

  const modal = (
    <>
      <ExpiringResignGateModal
        isOpen={open && !signingPlayer}
        rows={rows}
        onAssistant={handleAssistant}
        onManual={handleManual}
        onDismiss={handleDismiss}
        onMakeOffer={handleMakeOffer}
        onReject={handleReject}
        offeredIds={offeredIds}
        rejectedIds={rejectedIds}
      />
      {signingPlayer && userTeam && (
        <SignFreeAgentModal
          initialPlayer={signingPlayer}
          initialTeam={userTeam as any}
          directSigning
          onClose={() => setSigningPlayer(null)}
          onConfirm={async (payload) => {
            const playerId = signingPlayer.internalId;
            setSigningPlayer(null);
            await dispatchAction({ type: 'SIGN_FREE_AGENT' as any, payload: { ...payload, showFreeAgencySummary: true } });
            if (!mountedRef.current) return;
            setOfferedIds(prev => {
              const next = new Set(prev);
              next.add(playerId as any);
              return next;
            });
          }}
        />
      )}
    </>
  );

  // Manual open path — for callers that want to surface the resign modal as a
  // standalone task entry (e.g. the offseason AUFGABEN sidebar's My FAs row),
  // not as a pre-sim gate. Doesn't set pendingRef → no callback fires on close.
  const forceOpen = () => setOpen(true);

  return {
    attempt,
    modal,
    isBlocked: rows.length > 0,
    forceOpen,
    isOpen: open,
    hasRows: rows.length > 0,
    allResolved,
    actionableCount,
    reviewed,
    resolveWithAssistant: handleAssistant,
  };
}
